import { requireSanIdQuery } from '../../utils/san-query'
import { assertFsWritable } from '../../utils/fs-api-helpers'
import {
  assertClusteredSanAllowsFsMutation,
  executeClusterFsCreate,
  type ClusterFsExecutionRequest,
} from '../../../utils/fs-cluster-execution'
import type { CreateFsPayload } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateFsPayload & { clusterExecution: ClusterFsExecutionRequest }>(event)
  assertFsWritable(sanId)
  const cluster = assertClusteredSanAllowsFsMutation(sanId, body.clusterExecution)
  if (!cluster) {
    throw createError({ statusCode: 400, statusMessage: 'SAN non clusterisé' })
  }
  return executeClusterFsCreate(sanId, cluster.clusterId, body)
})
