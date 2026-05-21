/**
 * Per-SAN RAID page health — same inputs as Administration cluster cards
 * (`GET /api/cluster/attention` → `health`, `storageOverall`, `attentionPoints`).
 */
import type { ClusterAttentionPoint, ClusterAttentionResponse, ClusterHealth } from '~/types/cluster-admin'
import type { RaidCockpitHealth, RaidHealth } from '~/types/raid'

/** Attention categories that affect storage on the RAID page. */
export const RAID_CLUSTER_ATTENTION_CATEGORIES = new Set<ClusterAttentionPoint['category']>([
  'storage_md',
  'storage_lvm',
  'storage_replication',
  'scst',
])

const COCKPIT_RANK: Record<RaidCockpitHealth, number> = {
  healthy: 0,
  warning: 1,
  critical: 2,
  unknown: 3,
}

const RAID_RANK: Record<RaidHealth, number> = {
  ok: 0,
  rebuilding: 1,
  warning: 2,
  critical: 3,
  unknown: 4,
}

export function clusterHealthToCockpitHealth(health: ClusterHealth): RaidCockpitHealth {
  switch (health) {
    case 'healthy': return 'healthy'
    case 'warning': return 'warning'
    case 'critical': return 'critical'
    default: return 'unknown'
  }
}

export function cockpitHealthToRaidHealth(health: RaidCockpitHealth): RaidHealth {
  switch (health) {
    case 'healthy': return 'ok'
    case 'warning': return 'warning'
    case 'critical': return 'critical'
    default: return 'unknown'
  }
}

export function storageOverallToCockpitHealth(
  overall: ClusterAttentionResponse['storageOverall'],
): RaidCockpitHealth | undefined {
  if (!overall) return undefined
  switch (overall) {
    case 'ok': return 'healthy'
    case 'warning': return 'warning'
    case 'critical': return 'critical'
    default: return 'unknown'
  }
}

export function mergeRaidHealthWorst(a: RaidHealth, b: RaidHealth): RaidHealth {
  return RAID_RANK[a] >= RAID_RANK[b] ? a : b
}

export function mergeCockpitHealthWorst(a: RaidCockpitHealth, b: RaidCockpitHealth): RaidCockpitHealth {
  return COCKPIT_RANK[a] >= COCKPIT_RANK[b] ? a : b
}

/** Points forwarded into RAID cockpit mapper (path/cluster issues). */
export function raidRelevantClusterAttentionPoints(
  attention: ClusterAttentionResponse | null | undefined,
): ClusterAttentionPoint[] {
  if (!attention?.attentionPoints?.length) return []
  return attention.attentionPoints.filter(
    p => RAID_CLUSTER_ATTENTION_CATEGORIES.has(p.category) && p.severity !== 'info',
  )
}

/** Cluster-side cockpit health from API (same merge as Administration). */
export function resolveClusterCockpitHealthFromAttention(
  attention: ClusterAttentionResponse | null | undefined,
  derivedFromRaidItems: RaidCockpitHealth,
): RaidCockpitHealth {
  if (!attention) return derivedFromRaidItems

  let cluster = derivedFromRaidItems
  cluster = mergeCockpitHealthWorst(cluster, clusterHealthToCockpitHealth(attention.health))
  const storage = storageOverallToCockpitHealth(attention.storageOverall)
  if (storage) cluster = mergeCockpitHealthWorst(cluster, storage)
  return cluster
}

export interface PerSanRaidPageHealth {
  /** Worst of local + cluster (header primary badge). */
  pageHealth: RaidHealth
  localHealth: RaidHealth
  clusterHealth: RaidHealth
  localCockpit: RaidCockpitHealth
  clusterCockpit: RaidCockpitHealth
  mergedCockpit: RaidCockpitHealth
  isClusterCritical: boolean
  isClusterWarning: boolean
}

export function buildPerSanRaidPageHealth(input: {
  localRaidHealth: RaidHealth
  cockpit: {
    localHealth: RaidCockpitHealth
    clusterHealth: RaidCockpitHealth
    health: RaidCockpitHealth
  }
  clusterAttention: ClusterAttentionResponse | null | undefined
  isClustered: boolean
}): PerSanRaidPageHealth {
  const localCockpit = input.cockpit.localHealth
  let clusterCockpit = input.isClustered
    ? resolveClusterCockpitHealthFromAttention(input.clusterAttention, input.cockpit.clusterHealth)
    : 'healthy' as RaidCockpitHealth

  const mergedCockpit = input.isClustered
    ? mergeCockpitHealthWorst(localCockpit, clusterCockpit)
    : localCockpit

  const localHealth = input.localRaidHealth
  const clusterHealth = input.isClustered
    ? cockpitHealthToRaidHealth(clusterCockpit)
    : 'ok'
  const pageHealth = input.isClustered
    ? mergeRaidHealthWorst(localHealth, clusterHealth)
    : localHealth

  return {
    pageHealth,
    localHealth,
    clusterHealth,
    localCockpit,
    clusterCockpit,
    mergedCockpit,
    isClusterCritical: clusterCockpit === 'critical' || input.clusterAttention?.storageOverall === 'critical',
    isClusterWarning: clusterCockpit === 'warning' || input.clusterAttention?.storageOverall === 'warning',
  }
}

export interface ClusterRaidAlertCardModel {
  clusterId: string
  clusterName: string
  reason: string
  affectedNodeLabels: string[]
  affectedNodeIds: string[]
  peerSanId?: string
  severity: 'warning' | 'critical'
  storageSummary?: string
}

export function buildClusterRaidAlertCard(
  attention: ClusterAttentionResponse | null | undefined,
  currentSanId: string,
): ClusterRaidAlertCardModel | null {
  if (!attention) return null
  const cockpit = clusterHealthToCockpitHealth(attention.health)
  const storage = storageOverallToCockpitHealth(attention.storageOverall)
  const worst = mergeCockpitHealthWorst(cockpit, storage ?? 'healthy')
  if (worst !== 'critical' && worst !== 'warning') return null

  const points = attention.attentionPoints.filter(p => p.severity !== 'info')
  const storagePoints = points.filter(p => RAID_CLUSTER_ATTENTION_CATEGORIES.has(p.category))
  const top = storagePoints.find(p => p.severity === 'critical' || p.severity === 'blocking')
    ?? storagePoints[0]
    ?? points.find(p => p.severity === 'critical' || p.severity === 'blocking')
    ?? points[0]

  const affectedNodeIds = top
    ? [...new Set(top.affectedNodeIds)]
    : [...new Set(attention.overview?.nodes?.map(n => n.id) ?? [])]
  const affectedNodeLabels = top
    ? [...new Set(top.affectedNodeLabels)]
    : [...new Set(
        attention.overview?.nodes?.map(n => n.label).filter(Boolean) as string[] ?? [],
      )]

  const peerSanId = affectedNodeIds.find(id => id && id !== currentSanId)

  const reason = attention.storageSummary
    ?? top?.summary
    ?? top?.title
    ?? (worst === 'critical' ? 'Cluster storage critical' : 'Cluster storage warning')

  return {
    clusterId: attention.clusterId,
    clusterName: attention.clusterName ?? attention.clusterId,
    reason,
    affectedNodeLabels,
    affectedNodeIds,
    peerSanId,
    severity: worst === 'critical' ? 'critical' : 'warning',
    storageSummary: attention.storageSummary,
  }
}

/** Cluster attention points for overview tab (non-local). */
export function clusterAttentionPointsForOverview(
  attention: ClusterAttentionResponse | null | undefined,
): ClusterAttentionPoint[] {
  if (!attention) return []
  return attention.attentionPoints.filter(p => p.severity !== 'info')
}
