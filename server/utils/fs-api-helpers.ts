import { createError } from 'h3'
import { getActiveSSHManager, withSanContext } from './ssh-runtime'
import { collectFsOverview } from './fs-overview.service'
import { withCache, invalidateCacheKey } from './cache'
import { getSanSummary } from '../db/repositories/san.repository'
import type { FsOverview } from '~/types/filesystem'

export function fsOverviewCacheKey(sanId: string): string {
  return `fs-overview-${sanId}`
}

export async function withFsOverview<T>(
  sanId: string,
  refresh: boolean,
  fn: (overview: FsOverview) => Promise<T>,
): Promise<T> {
  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = fsOverviewCacheKey(sanId)
    if (refresh) invalidateCacheKey(cacheKey)
    const overview = await withCache(cacheKey, 60_000, () => collectFsOverview(manager))
    return fn(overview)
  }
  return withSanContext(sanId, run)
}

export function invalidateFsCaches(sanId: string): void {
  invalidateCacheKey(fsOverviewCacheKey(sanId))
  invalidateCacheKey(`lvm-overview-${sanId}`)
  invalidateCacheKey(`raid-overview-${sanId}`)
  invalidateCacheKey('overview')
}

export function assertFsWritable(sanId: string): void {
  const san = getSanSummary(sanId)
  if (san?.readOnly) {
    throw createError({ statusCode: 403, statusMessage: 'SAN en lecture seule' })
  }
}
