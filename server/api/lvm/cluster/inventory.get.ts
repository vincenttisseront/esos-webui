import { getQuery } from 'h3'
import { collectClusterLvmInventory } from '../../../utils/lvm-cluster-preflight'

export default defineEventHandler(async (event) => {
  const clusterId = String(getQuery(event).clusterId ?? '').trim()
  if (!clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId requis' })
  }
  const nodes = await collectClusterLvmInventory(clusterId)
  return { clusterId, nodes }
})
