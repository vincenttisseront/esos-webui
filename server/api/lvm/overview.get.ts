/**
 * GET /api/lvm/overview — Scan LVM (PV/VG/LV + candidates).
 */
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { collectLvmOverview } from '../../utils/lvm-overview.service'
import { loadClusterPeerLvmDetection } from '../../utils/lvm-cluster-execution'
import { withCache, invalidateCacheKey } from '../../utils/cache'
import { resolveScopedSanIdForRead } from '../../utils/san-request-context'
import type { LvmOverviewResponse } from '../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const { refresh } = getQuery(event) as { refresh?: string }
  const scopeId = resolveScopedSanIdForRead(event)
  if (!scopeId) {
    throw createError({ statusCode: 400, statusMessage: 'sanId requis' })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `lvm-overview-${scopeId}`
    if (refresh === '1') invalidateCacheKey(cacheKey)
    let overview = await withCache(cacheKey, 60_000, () => collectLvmOverview(manager))
    const clusterLvmDetection = await loadClusterPeerLvmDetection(scopeId)
    if (clusterLvmDetection.length) {
      overview = { ...overview, clusterLvmDetection }
    }
    return overview
  }

  try {
    return await withSanContext(scopeId, run) as LvmOverviewResponse
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 503,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur scan LVM',
    })
  }
})
