import { buildAluaClusterReport } from '../../utils/alua-cluster-report'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId.trim() : ''
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }

  const includeScstCrossCheck
    = query.includeScstCrossCheck === 'true' || query.includeScstCrossCheck === '1'

  try {
    return await buildAluaClusterReport(clusterId, { includeScstCrossCheck })
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur lecture ALUA cluster',
    })
  }
})
