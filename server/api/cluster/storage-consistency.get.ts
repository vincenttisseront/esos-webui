import { buildClusterStorageConsistency } from '../../utils/cluster-storage-consistency'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId.trim() : ''
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }
  try {
    return await buildClusterStorageConsistency(clusterId)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur cohérence stockage cluster',
    })
  }
})
