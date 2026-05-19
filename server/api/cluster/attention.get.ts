import { eq } from 'drizzle-orm'
import { getDB } from '../../db'
import { clusters } from '../../db/schema'
import { readClusterNodeStatus } from '../../utils/cluster-reader'
import type { ClusterAttentionResponse } from '../../utils/cluster-admin-types'
import {
  appendMdAttentionPoints,
  appendRegistryAttentionPoints,
  appendScstAttentionPoints,
  buildClusterAttentionFromStatus,
  deriveClusterHealth,
  mergeClusterHealth,
  storageOverallToHealth,
} from '../../utils/cluster-attention'
import { buildClusterStorageConsistency } from '../../utils/cluster-storage-consistency'
import { resolveClusterMembers } from '../../utils/cluster-resolve'
import type { ClusterNodeRole, ClusterOverview } from '../../utils/types'

export default defineEventHandler(async (event): Promise<ClusterAttentionResponse> => {
  const query = getQuery(event)
  const rawClusterId = query.clusterId
  const clusterId
    = typeof rawClusterId === 'string' && rawClusterId.trim()
      ? rawClusterId.trim()
      : null

  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }

  const includeMd = query.includeMd !== 'false'
  const members = resolveClusterMembers({ clusterId })
  const db = getDB()
  const clusterRow = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()

  let overview: ClusterOverview | undefined
  let probeError: string | undefined

  try {
    if (members.length === 0) {
      overview = { nodes: [], mode: 'unconfigured', healthy: false, scannedAt: Date.now(), clusterId }
    } else {
      const statuses = await Promise.all(
        members.map(n =>
          readClusterNodeStatus(n.id, n.host, (n.clusterRole ?? 'primary') as ClusterNodeRole),
        ),
      )
      statuses.forEach((s, i) => {
        const dbLabel = members[i]?.label
        if (dbLabel && (!s.hostname || s.hostname === 'localhost' || s.hostname === '127.0.0.1')) {
          s.hostname = dbLabel
        }
      })
      const healthy = statuses.every(s => s.sshReady && s.corosyncRunning && s.pacemakerRunning)
      overview = {
        nodes: statuses,
        mode: deriveMode(statuses),
        healthy,
        scannedAt: Date.now(),
        clusterId,
        clusterName: clusterRow?.name,
      }
    }
  } catch (err: any) {
    probeError = err?.statusMessage ?? err?.message ?? 'Probe cluster échouée'
    overview = {
      nodes: [],
      mode: 'unconfigured',
      healthy: false,
      scannedAt: Date.now(),
      clusterId,
      clusterName: clusterRow?.name,
    }
  }

  let attentionPoints = buildClusterAttentionFromStatus(
    overview,
    members,
    probeError,
  )

  const primaryId = members.find(m => m.clusterRole === 'primary')?.id

  if (includeMd && !probeError) {
    attentionPoints = await appendMdAttentionPoints(clusterId, attentionPoints, primaryId)
  }

  if (!probeError && members.length > 0) {
    attentionPoints = await appendRegistryAttentionPoints(clusterId, members, attentionPoints, primaryId)
  }

  let storageOverall: import('../../utils/cluster-admin-types').ClusterStorageConsistencyResult['overall'] = 'unknown'
  let storageSummary: string | undefined
  if (!probeError && includeMd) {
    try {
      const storage = await buildClusterStorageConsistency(clusterId)
      storageOverall = storage.overall
      storageSummary = storage.mdSummary
      attentionPoints = appendScstAttentionPoints(clusterId, attentionPoints, storage, primaryId)
    } catch {
      storageOverall = 'unknown'
    }
  }

  const attentionHealth = deriveClusterHealth(attentionPoints, !probeError)
  const health = mergeClusterHealth(
    attentionHealth,
    storageOverallToHealth(storageOverall),
    !probeError,
  )

  return {
    clusterId,
    clusterName: clusterRow?.name ?? overview?.clusterName,
    health,
    attentionPoints,
    attentionCount: attentionPoints.filter(p => p.severity !== 'info').length,
    overview,
    probeError,
    scannedAt: overview?.scannedAt ?? Date.now(),
    storageOverall,
    storageSummary,
  }
})

function deriveMode(nodes: import('../../utils/types').ClusterNodeStatus[]): ClusterOverview['mode'] {
  if (nodes.length === 0) return 'unconfigured'
  const allOnline = nodes.every(n => n.pacemakerRunning)
  if (!allOnline) return 'degraded'
  const anyDRBDSplitBrain = nodes.some(n => n.drbd.resources.some(r => r.connState === 'StandAlone'))
  if (anyDRBDSplitBrain) return 'split-brain'
  const anyDRBDSyncing = nodes.some(n => n.drbd.resources.some(r => r.isSyncing))
  if (anyDRBDSyncing) return 'resyncing'
  const bothActive = nodes.every(n => n.aluaGroups.some(g => g.state === 'active'))
  if (bothActive) return 'active-active'
  const anyMasterSlave = nodes.some(n => n.resources.some(r => ['Master', 'Slave'].includes(r.state)))
  if (anyMasterSlave) return 'active-passive'
  return 'active-passive'
}
