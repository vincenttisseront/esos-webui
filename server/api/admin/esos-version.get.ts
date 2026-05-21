import { buildVersionReport } from '../../utils/esos-version-reader'
import { invalidateCacheKey } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  if (query.refresh === '1') {
    invalidateCacheKey('esos-version-report')
    invalidateCacheKey('esos-github-tags')
    invalidateCacheKey('esos-github-latest-stable')
  }

  return buildVersionReport()
})
