import { defineEventHandler, getQuery } from 'h3'
import { buildDependenciesReport } from '../../utils/deps-reader'
import { invalidateCacheKey } from '../../utils/cache'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  if (query.refresh === '1') {
    invalidateCacheKey('dependencies-report')
  }

  try {
    return await buildDependenciesReport()
  } catch (err) {
    console.warn('[Dependencies API] fallback to empty report:', (err as Error).message)
    return {
      scannedAt: Date.now(),
      totalCount: 0,
      outdated: 0,
      majorUpdates: 0,
      minorUpdates: 0,
      patchUpdates: 0,
      packages: [],
    }
  }
})
