import type { ClusterNodeStatus, ClusterOverview } from './types'
import type {
  ClusterAttentionPoint,
  ClusterAttentionRecommendedAction,
  ClusterAttentionSeverity,
  ClusterHealth,
} from './cluster-admin-types'
import type { ClusterSanMember } from './cluster-resolve'
import type { MdDetectionItem } from './raid-md-detection'
import { buildMdDetectionSummary } from './raid-md-detection'
import { collectClusterStorageInventory } from './raid-cluster-storage-preflight'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'

const SEVERITY_RANK: Record<ClusterAttentionSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
  blocking: 3,
}

function isMdAttentionItem(item: MdDetectionItem): boolean {
  if (item.recommendedAction && item.recommendedAction !== 'none') return true
  return item.severity === 'warning' || item.severity === 'blocking'
}

function mapMdSeverity(severity: MdDetectionItem['severity']): ClusterAttentionSeverity {
  if (severity === 'blocking') return 'blocking'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function mdItemToAttention(item: MdDetectionItem): ClusterAttentionPoint {
  const sev = mapMdSeverity(item.severity)
  return {
    id: `md:${item.nodeSanId}:${item.path}:${item.kind}`,
    severity: sev === 'info' ? 'warning' : sev,
    category: 'storage_md',
    title: item.path,
    summary: item.summary.length > 120 ? `${item.summary.slice(0, 119)}…` : item.summary,
    affectedNodeIds: [item.nodeSanId],
    affectedNodeLabels: [item.nodeLabel],
    recommendedAction: 'open_raid',
    actionRoute: `/admin/sans/${item.nodeSanId}/raid`,
    actionPayload: { path: item.path, uiAnchor: item.uiAnchor },
    dismissible: false,
    source: 'md_detection',
    detectedAt: Date.now(),
  }
}

export function buildClusterAttentionFromStatus(
  overview: ClusterOverview,
  members: ClusterSanMember[],
  probeError?: string,
): ClusterAttentionPoint[] {
  const points: ClusterAttentionPoint[] = []
  const now = Date.now()

  if (probeError) {
    points.push({
      id: 'probe_error',
      severity: 'critical',
      category: 'connectivity',
      title: 'État cluster indisponible',
      summary: probeError,
      affectedNodeIds: members.map(m => m.id),
      affectedNodeLabels: members.map(m => m.label),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/cluster?clusterId=${overview.clusterId}` : '/cluster',
      dismissible: false,
      source: 'cluster_status',
      detectedAt: now,
    })
    return points
  }

  if (members.length > 0 && !members.some(m => m.clusterRole === 'primary')) {
    points.push({
      id: 'no_primary',
      severity: 'critical',
      category: 'roles',
      title: 'Nœud primaire manquant',
      summary: 'Aucun nœud n\'est désigné primaire dans la base — les actions stockage cluster sont bloquées.',
      affectedNodeIds: members.map(m => m.id),
      affectedNodeLabels: members.map(m => m.label),
      recommendedAction: 'set_primary',
      actionRoute: overview.clusterId ? `/admin/cluster?clusterId=${overview.clusterId}` : '/admin/cluster',
      dismissible: false,
      source: 'san_registry',
      detectedAt: now,
    })
  }

  const readOnlyFlags = members.map(m => m.readOnly)
  if (readOnlyFlags.some(Boolean) && readOnlyFlags.some(r => !r)) {
    points.push({
      id: 'read_only_mismatch',
      severity: 'warning',
      category: 'config',
      title: 'Lecture seule incohérente',
      summary: 'Les nœuds du cluster n\'ont pas le même mode édition WebUI.',
      affectedNodeIds: members.filter(m => m.readOnly).map(m => m.id),
      affectedNodeLabels: members.filter(m => m.readOnly).map(m => m.label),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/admin/sans?clusterId=${overview.clusterId}` : '/admin/sans',
      dismissible: false,
      source: 'config',
      detectedAt: now,
    })
  }

  if (overview.mode === 'split-brain') {
    points.push({
      id: 'drbd_split_brain',
      severity: 'critical',
      category: 'storage_replication',
      title: 'Split-brain DRBD',
      summary: 'Au moins une ressource DRBD est en état StandAlone — intervention requise.',
      affectedNodeIds: overview.nodes.map(n => n.nodeId),
      affectedNodeLabels: overview.nodes.map(n => n.hostname),
      recommendedAction: 'open_cluster_ha',
      actionRoute: overview.clusterId ? `/cluster?clusterId=${overview.clusterId}` : '/cluster',
      dismissible: false,
      source: 'cluster_status',
      detectedAt: now,
    })
  }

  for (const node of overview.nodes) {
    if (!node.sshReady) {
      points.push(nodeAttention(node, {
        id: `ssh:${node.nodeId}`,
        severity: 'critical',
        category: 'connectivity',
        title: `SSH indisponible — ${node.hostname}`,
        summary: 'Le nœud ne répond pas via SSH — reconnectez ou vérifiez le réseau.',
        recommendedAction: 'reconnect',
      }))
      continue
    }
    if (!node.corosyncRunning || !node.pacemakerRunning) {
      points.push(nodeAttention(node, {
        id: `services:${node.nodeId}`,
        severity: 'critical',
        category: 'cluster_services',
        title: `Services HA arrêtés — ${node.hostname}`,
        summary: `Corosync: ${node.corosyncRunning ? 'OK' : 'arrêté'} · Pacemaker: ${node.pacemakerRunning ? 'OK' : 'arrêté'}`,
        recommendedAction: 'open_cluster_ha',
      }))
    }
    if (node.pacemakerRunning && !node.quorate) {
      points.push(nodeAttention(node, {
        id: `quorum:${node.nodeId}`,
        severity: 'critical',
        category: 'cluster_services',
        title: `Quorum perdu — ${node.hostname}`,
        summary: 'Le cluster n\'est pas quorate selon corosync-quorumtool.',
        recommendedAction: 'open_cluster_ha',
      }))
    }
    for (const res of node.resources) {
      if (res.state === 'Stopped' || res.state === 'Unknown') {
        points.push(nodeAttention(node, {
          id: `resource:${node.nodeId}:${res.id}`,
          severity: 'warning',
          category: 'cluster_services',
          title: `Ressource ${res.id} — ${res.state}`,
          summary: `Ressource Pacemaker ${res.type} sur ${node.hostname}.`,
          recommendedAction: 'open_cluster_ha',
        }))
      }
    }
  }

  return dedupeAttention(points)
}

function nodeAttention(
  node: ClusterNodeStatus,
  partial: Omit<ClusterAttentionPoint, 'affectedNodeIds' | 'affectedNodeLabels' | 'dismissible' | 'source' | 'detectedAt' | 'actionRoute'> & {
    recommendedAction: ClusterAttentionRecommendedAction
    actionRoute?: string
  },
): ClusterAttentionPoint {
  return {
    ...partial,
    affectedNodeIds: [node.nodeId],
    affectedNodeLabels: [node.hostname],
    actionRoute: partial.actionRoute,
    dismissible: false,
    source: 'cluster_status',
    detectedAt: Date.now(),
  }
}

export async function appendMdAttentionPoints(
  clusterId: string,
  points: ClusterAttentionPoint[],
  primarySanId?: string,
): Promise<ClusterAttentionPoint[]> {
  const merged = [...points]
  try {
    const inventories = await collectClusterStorageInventory({ clusterId })
    for (const inv of inventories) {
      if (!inv.sshReady) continue
      const summary = buildMdDetectionSummary({
        nodeSanId: inv.sanId,
        nodeLabel: inv.label,
        mdArrays: inv.mdArrays,
        stoppedMdArrays: inv.stoppedMdArrays ?? [],
        blockDevices: inv.blockDevices,
      })
      for (const item of summary.items) {
        if (isMdAttentionItem(item)) merged.push(mdItemToAttention(item))
      }
    }

    const arrayNames = new Set<string>()
    for (const inv of inventories) {
      for (const arr of inv.mdArrays) arrayNames.add(arr.name)
      for (const arr of inv.stoppedMdArrays ?? []) {
        if (arr.name && arr.name !== 'unknown') arrayNames.add(arr.name)
      }
    }
    const primary = primarySanId ?? inventories.find(i => i.role === 'primary')?.sanId ?? inventories[0]?.sanId
    if (primary) {
      for (const name of arrayNames) {
        try {
          const assessment = buildClusterMdRecoveryAssessment({
            action: 'stop_md',
            arrayName: name,
            nodes: inventories,
          })
          if (assessment.hardBlockers.length) {
            merged.push({
              id: `md_asym:${name}`,
              severity: 'blocking',
              category: 'storage_md',
              title: `MD ${name} — asymétrie cluster`,
              summary: assessment.hardBlockers[0] ?? 'État MD incohérent entre nœuds',
              affectedNodeIds: assessment.nodeReports.map(r => r.sanId),
              affectedNodeLabels: assessment.nodeReports.map(r => r.label),
              recommendedAction: 'run_recovery',
              actionRoute: `/admin/sans/${primary}/raid`,
              actionPayload: { arrayName: name },
              dismissible: false,
              source: 'md_detection',
              detectedAt: Date.now(),
            })
          } else if (!assessment.okSymmetric && assessment.warnings.length) {
            merged.push({
              id: `md_warn:${name}`,
              severity: 'warning',
              category: 'storage_md',
              title: `MD ${name} — état dégradé`,
              summary: assessment.warnings[0] ?? 'Symétrie MD non confirmée',
              affectedNodeIds: assessment.nodeReports.map(r => r.sanId),
              affectedNodeLabels: assessment.nodeReports.map(r => r.label),
              recommendedAction: 'open_raid',
              actionRoute: `/admin/sans/${primary}/raid`,
              dismissible: false,
              source: 'md_detection',
              detectedAt: Date.now(),
            })
          }
        } catch {
          // skip array assessment errors
        }
      }
    }
  } catch {
    // MD inventory optional for attention
  }
  return dedupeAttention(merged)
}

function dedupeAttention(points: ClusterAttentionPoint[]): ClusterAttentionPoint[] {
  const map = new Map<string, ClusterAttentionPoint>()
  for (const p of points) {
    const existing = map.get(p.id)
    if (!existing || SEVERITY_RANK[p.severity] > SEVERITY_RANK[existing.severity]) {
      map.set(p.id, p)
    }
  }
  return [...map.values()].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])
}

export function deriveClusterHealth(
  attentionPoints: ClusterAttentionPoint[],
  probeSucceeded: boolean,
): ClusterHealth {
  if (!probeSucceeded) return 'unknown'
  const actionable = attentionPoints.filter(p => p.severity !== 'info')
  if (actionable.length === 0) return 'healthy'
  if (actionable.some(p => p.severity === 'blocking' || p.severity === 'critical')) return 'critical'
  return 'warning'
}
