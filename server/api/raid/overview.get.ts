/**
 * GET /api/raid/overview — Scan complet RAID (SDD v3.12 §8.1).
 * Cache 60s, invalidable via ?refresh=1.
 */
import { and, eq } from 'drizzle-orm'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { attachMdDetectionLabels, collectRaidOverview } from '../../utils/raid-overview.service'
import { buildMdDetectionSummary } from '../../utils/raid-md-detection'
import { withCache, invalidateCacheKey } from '../../utils/cache'
import { resolveScopedSanIdForRead } from '../../utils/san-request-context'
import { getDB } from '../../db'
import { sans } from '../../db/schema'
import { getSSHPool } from '../../utils/ssh-pool'
import type { RaidOverviewResponse } from '../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const { refresh } = getQuery(event) as { sanId?: string; refresh?: string }
  const scopeId = resolveScopedSanIdForRead(event)
  const cacheSanKey = scopeId ?? 'default'

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `raid-overview-${cacheSanKey}`
    if (refresh === '1') invalidateCacheKey(cacheKey)
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))
    return overview
  }

  try {
    let overview: RaidOverviewResponse
    if (scopeId) {
      overview = await withSanContext(scopeId, run)
      const label = resolveSanLabel(scopeId)
      overview = attachMdDetectionLabels(overview, scopeId, label)
      const clusterMdDetection = await loadClusterPeerMdDetection(scopeId)
      if (clusterMdDetection.length) overview = { ...overview, clusterMdDetection }
    } else {
      overview = await run()
      overview = attachMdDetectionLabels(overview, '', 'local')
    }
    return overview
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 503,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur scan RAID',
    })
  }
})

function resolveSanLabel(sanId: string): string {
  try {
    const row = getDB().select({ label: sans.label }).from(sans).where(eq(sans.id, sanId)).get()
    return row?.label ?? sanId
  } catch {
    return sanId
  }
}

async function loadClusterPeerMdDetection(currentSanId: string): Promise<import('../../utils/raid-types').MdDetectionSummary[]> {
  let clusterId: string | null = null
  try {
    const row = getDB()
      .select({ clusterId: sans.clusterId, clusterEnabled: sans.clusterEnabled })
      .from(sans)
      .where(eq(sans.id, currentSanId))
      .get()
    if (!row?.clusterId || !row.clusterEnabled) return []
    clusterId = row.clusterId
  } catch {
    return []
  }

  const peers = getDB()
    .select({ id: sans.id, label: sans.label })
    .from(sans)
    .where(and(eq(sans.clusterId, clusterId), eq(sans.clusterEnabled, true)))
    .all()
    .filter(p => p.id !== currentSanId)

  if (!peers.length) return []

  const pool = getSSHPool()
  const summaries: import('../../utils/raid-types').MdDetectionSummary[] = []

  await Promise.all(peers.map(async (peer) => {
    const manager = pool.get(peer.id)
    if (!manager || manager.getStatus() !== 'connected') {
      summaries.push({
        nodeSanId: peer.id,
        nodeLabel: peer.label,
        hasAnyMdState: false,
        items: [],
      })
      return
    }
    try {
      const peerOverview = await collectRaidOverview(manager)
      const summary = buildMdDetectionSummary({
        nodeSanId: peer.id,
        nodeLabel: peer.label,
        mdArrays: peerOverview.mdArrays,
        stoppedMdArrays: peerOverview.stoppedMdArrays,
        blockDevices: peerOverview.blockDevices,
      })
      summaries.push({
        ...summary,
        activeMdArrays: peerOverview.mdArrays.map(a => ({
          name: a.name,
          path: a.path,
          uuid: a.uuid,
          state: a.state,
          raidLevel: a.raidLevel,
          raidDevices: a.raidDevices,
          activeDevices: a.activeDevices,
          workingDevices: a.workingDevices,
          failedDevices: a.failedDevices,
          sizeBytes: a.sizeBytes,
          memberCount: a.members?.length ?? 0,
        })),
      })
    } catch {
      summaries.push({
        nodeSanId: peer.id,
        nodeLabel: peer.label,
        hasAnyMdState: false,
        items: [],
      })
    }
  }))

  return summaries
}
