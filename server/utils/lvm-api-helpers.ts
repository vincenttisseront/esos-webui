import { createError } from 'h3'
import { getActiveSSHManager, withSanContext } from './ssh-runtime'
import { collectLvmOverview } from './lvm-overview.service'
import { runLvmPreflight } from './lvm-preflight'
import { withCache, invalidateCacheKey } from './cache'
import { getSanSummary } from '../db/repositories/san.repository'
import { assertClusteredSanAllowsLvmMutation } from './lvm-cluster-execution'
import type { LvmPreflightRequest } from './lvm-types'

export async function withLvmOverview<T>(
  sanId: string,
  refresh: boolean,
  fn: (overview: Awaited<ReturnType<typeof collectLvmOverview>>) => Promise<T>,
): Promise<T> {
  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `lvm-overview-${sanId}`
    if (refresh) invalidateCacheKey(cacheKey)
    const overview = await withCache(cacheKey, 60_000, () => collectLvmOverview(manager))
    return fn(overview)
  }
  return withSanContext(sanId, run)
}

export async function requirePreflightOk(
  sanId: string,
  req: LvmPreflightRequest,
  clusterExecution?: LvmPreflightRequest['clusterExecution'],
): Promise<void> {
  const san = getSanSummary(sanId)
  if (san?.readOnly) {
    throw createError({ statusCode: 403, statusMessage: 'SAN en lecture seule' })
  }
  if (san?.clusterId && req.action !== 'bind_scst') {
    assertClusteredSanAllowsLvmMutation(sanId, clusterExecution)
  }
  await withLvmOverview(sanId, false, async (overview) => {
    const manager = getActiveSSHManager()
    if (!manager) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    const pre = await runLvmPreflight(manager, req, overview)
    if (!pre.ok) {
      throw createError({
        statusCode: 422,
        statusMessage: pre.blockers.join(' · ') || 'Préflight échoué',
        data: { preflight: pre },
      })
    }
    const confirmation = String((req.payload as { confirmation?: string }).confirmation ?? '').trim()
    if (confirmation !== pre.requiredConfirmation) {
      throw createError({
        statusCode: 400,
        statusMessage: `Confirmation requise : ${pre.requiredConfirmation}`,
      })
    }
  })
}

export function invalidateStorageCaches(sanId: string) {
  invalidateCacheKey(`lvm-overview-${sanId}`)
  invalidateCacheKey(`raid-overview-${sanId}`)
}
