/**
 * GET /api/raid/software/arrays (SDD v3.12 §8.1).
 */
import { getActiveSSHManager, withSanContext } from '../../../utils/ssh-runtime'
import { collectRaidOverview } from '../../../utils/raid-overview.service'
import { withCache } from '../../../utils/cache'
import { resolveScopedSanIdForRead } from '../../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const scopeId = resolveScopedSanIdForRead(event)
  const cacheSanKey = scopeId ?? 'default'

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const cacheKey = `raid-overview-${cacheSanKey}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))
    return overview.mdArrays
  }

  try {
    if (scopeId) return await withSanContext(scopeId, run)
    return await run()
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 503,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur arrays MD',
    })
  }
})
