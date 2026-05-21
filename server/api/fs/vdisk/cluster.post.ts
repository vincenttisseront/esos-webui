import { requireSanIdQuery } from '../../../utils/san-query'
import { assertFsWritable } from '../../../utils/fs-api-helpers'
import {
  assertClusteredSanAllowsFsMutation,
  executeClusterVdiskCreate,
  type ClusterFsExecutionRequest,
} from '../../../utils/fs-cluster-execution'
import type { CreateVdiskPayload } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateVdiskPayload & { clusterExecution: ClusterFsExecutionRequest }>(event)
  assertFsWritable(sanId)
  const cluster = assertClusteredSanAllowsFsMutation(sanId, body.clusterExecution)
  if (!cluster) throw createError({ statusCode: 400, statusMessage: 'SAN non clusterisé' })
  return executeClusterVdiskCreate(sanId, cluster.clusterId, body)
})
