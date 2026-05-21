import { buildVersionReport } from '../../utils/esos-version-reader'
import { invalidateCacheKey } from '../../utils/cache'
import { canForceRefreshGitHub, invalidateGitHubCaches } from '../../utils/esos-github'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const forceRefresh = query.refresh === '1'

  if (forceRefresh) {
    if (!canForceRefreshGitHub()) {
      throw createError({
        statusCode: 429,
        message: 'GitHub refresh throttled — wait before retrying',
        data: { code: 'github.refresh_throttled' },
      })
    }
    invalidateCacheKey('esos-version-report')
    invalidateGitHubCaches()
  }

  return buildVersionReport({ forceRefresh })
})
