import { collectSystemInventory } from '../../../utils/system-inventory.service'
import { invalidateCacheKey } from '../../../utils/cache'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')
  if (!sanId) {
    throw createError({ statusCode: 400, statusMessage: 'sanId is required' })
  }

  const query = getQuery(event)
  if (query.refresh === '1') {
    invalidateCacheKey(`sysinfo-${sanId}`)
  }

  try {
    return await collectSystemInventory(sanId)
  } catch (err: unknown) {
    throw createError({
      statusCode: 503,
      statusMessage: err instanceof Error ? err.message : 'Inventory collection failed',
    })
  }
})
