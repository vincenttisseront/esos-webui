import { requireSanIdQuery } from '../../../utils/san-query'
import { assertFsWritable } from '../../../utils/fs-api-helpers'
import {
  assertClusteredSanAllowsFsMutation,
  executeClusterFileioBind,
  type ClusterFsExecutionRequest,
} from '../../../utils/fs-cluster-execution'
import type { CreateFileioPayload, FsNextAction } from '~/types/filesystem'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<CreateFileioPayload & { clusterExecution: ClusterFsExecutionRequest }>(event)
  assertFsWritable(sanId)
  const cluster = assertClusteredSanAllowsFsMutation(sanId, body.clusterExecution)
  if (!cluster) throw createError({ statusCode: 400, statusMessage: 'SAN non clusterisé' })
  const result = await executeClusterFileioBind(cluster.clusterId, body)
  const nextAction: FsNextAction = {
    route: '/targets',
    query: { exposeDevice: body.deviceName },
  }
  return { ...result, nextAction }
})
