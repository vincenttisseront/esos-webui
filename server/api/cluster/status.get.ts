import { eq, inArray, isNotNull } from 'drizzle-orm'
import { getDB } from '../../db'
import { sans, clusters } from '../../db/schema'
import { readClusterNodeStatus } from '../../utils/cluster-reader'
import { assertImplicitClusterCandidatesAllowed } from '../../utils/cluster-scope'
import type { ClusterNodeRole, ClusterNodeStatus, ClusterOverview } from '../../utils/types'

export default defineEventHandler(async (event): Promise<ClusterOverview> => {
  const query = getQuery(event)
  const rawIds = query.nodeIds
  const explicitIds: string[] | null = rawIds
    ? (Array.isArray(rawIds) ? rawIds : String(rawIds).split(',').filter(Boolean))
    : null

  const rawClusterId = query.clusterId
  const clusterIdFilter
    = typeof rawClusterId === 'string' && rawClusterId.trim()
      ? rawClusterId.trim()
      : null

  const db = getDB()

  let clusterNodes

  if (explicitIds?.length) {
    clusterNodes = db.select().from(sans).where(inArray(sans.id, explicitIds)).all()
  } else if (clusterIdFilter) {
    clusterNodes = db.select().from(sans).where(eq(sans.clusterId, clusterIdFilter)).all()
  } else {
    const fromEnabled = db.select().from(sans).where(eq(sans.clusterEnabled, true)).all()
    if (fromEnabled.length > 0) {
      assertImplicitClusterCandidatesAllowed(fromEnabled)
      clusterNodes = fromEnabled
    } else {
      const fromClusterId = db.select().from(sans).where(isNotNull(sans.clusterId)).all()
      assertImplicitClusterCandidatesAllowed(fromClusterId)
      clusterNodes = fromClusterId
    }
  }

  if (clusterNodes.length === 0) {
    return { nodes: [], mode: 'unconfigured', healthy: false, scannedAt: Date.now() }
  }

  const statuses = await Promise.all(
    clusterNodes.map(n =>
      readClusterNodeStatus(n.id, n.host, (n.clusterRole ?? 'primary') as ClusterNodeRole),
    ),
  )

  statuses.forEach((s, i) => {
    const dbLabel = clusterNodes[i]?.label
    if (dbLabel && (!s.hostname || s.hostname === 'localhost' || s.hostname === '127.0.0.1')) {
      s.hostname = dbLabel
    }
  })

  const mode = deriveClusterMode(statuses)
  const healthy = statuses.every(s => s.sshReady && s.corosyncRunning && s.pacemakerRunning)

  const clusterId = clusterNodes[0]?.clusterId ?? undefined
  let clusterName: string | undefined
  if (clusterId) {
    const cluster = db.select().from(clusters).where(eq(clusters.id, clusterId)).get()
    clusterName = cluster?.name
  }
  if (!clusterName) {
    clusterName = statuses.find(s => s.clusterName)?.clusterName || undefined
  }

  return { nodes: statuses, mode, healthy, scannedAt: Date.now(), clusterId, clusterName }
})

function deriveClusterMode(nodes: ClusterNodeStatus[]): ClusterOverview['mode'] {
  if (nodes.length === 0) return 'unconfigured'

  const allOnline = nodes.every(n => n.pacemakerRunning)
  const anyMasterSlave = nodes.some(n => n.resources.some(r => ['Master', 'Slave'].includes(r.state)))
  const bothActive = nodes.every(n => n.aluaGroups.some(g => g.state === 'active'))

  if (!allOnline) return 'degraded'

  const anyDRBDSplitBrain = nodes.some(n => n.drbd.resources.some(r => r.connState === 'StandAlone'))
  if (anyDRBDSplitBrain) return 'split-brain'

  const anyDRBDSyncing = nodes.some(n => n.drbd.resources.some(r => r.isSyncing))
  if (anyDRBDSyncing) return 'resyncing'

  if (bothActive) return 'active-active'
  if (anyMasterSlave) return 'active-passive'
  return 'active-passive'
}
