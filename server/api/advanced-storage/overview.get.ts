/**
 * GET /api/advanced-storage/overview — Read-only advanced storage inventory per SAN.
 * Cache 60s, invalidable via ?refresh=1.
 */
import { eq } from 'drizzle-orm'
import { getActiveSSHManager, withSanContext } from '../../utils/ssh-runtime'
import { collectAdvancedStorageOverview } from '../../utils/advanced-storage-collector'
import { withCache, invalidateCacheKey } from '../../utils/cache'
import { resolveScopedSanIdForRead } from '../../utils/san-request-context'
import { getDB } from '../../db'
import { sans } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const { refresh } = getQuery(event) as { refresh?: string }
  const scopeId = resolveScopedSanIdForRead(event)
  if (!scopeId) {
    throw createError({ statusCode: 400, statusMessage: 'SAN scope required' })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `advanced-storage-${scopeId}`
    if (refresh === '1') invalidateCacheKey(cacheKey)
    const clusterId = resolveClusterId(scopeId)
    return withCache(cacheKey, 60_000, () =>
      collectAdvancedStorageOverview(manager, scopeId, clusterId),
    )
  }

  try {
    return await withSanContext(scopeId, run)
  } catch (err: unknown) {
    const e = err as { statusCode?: number; statusMessage?: string; message?: string }
    throw createError({
      statusCode: e.statusCode ?? 503,
      statusMessage: e.statusMessage ?? e.message ?? 'Erreur scan Advanced Storage',
    })
  }
})

function resolveClusterId(sanId: string): string | null {
  try {
    const row = getDB()
      .select({ clusterId: sans.clusterId, clusterEnabled: sans.clusterEnabled })
      .from(sans)
      .where(eq(sans.id, sanId))
      .get()
    if (!row?.clusterId || !row.clusterEnabled) return null
    return row.clusterId
  } catch {
    return null
  }
}
