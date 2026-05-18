import { collectClusterStorageInventory } from '../../../utils/raid-cluster-storage-preflight'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const clusterId = typeof query.clusterId === 'string' ? query.clusterId : undefined
  const nodeIds = query.nodeIds
    ? (Array.isArray(query.nodeIds) ? query.nodeIds : String(query.nodeIds).split(',')).filter(Boolean)
    : undefined

  try {
    return await collectClusterStorageInventory({ clusterId, nodeIds })
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur inventaire RAID cluster',
    })
  }
})
