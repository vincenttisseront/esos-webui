import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsLvmMutation,
  buildClusterPvCreatePlan,
  executeClusterLvmPlan,
} from '../../../../utils/lvm-cluster-execution'
import type { ClusterLvmDiskMapping, PvCreatePayload } from '../../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<PvCreatePayload & {
    clusterExecution: { primarySanId: string; clusterId?: string; diskMappings?: ClusterLvmDiskMapping[] }
  }>(event)
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Exécution cluster requise pour un SAN clusterisé' })
  }
  const clusterInfo = assertClusteredSanAllowsLvmMutation(sanId, body.clusterExecution)
  const clusterId = body.clusterExecution.clusterId ?? clusterInfo!.clusterId
  const mappings = body.clusterExecution.diskMappings ?? []
  const plan = await buildClusterPvCreatePlan(
    body.clusterExecution.primarySanId,
    clusterId,
    body,
    mappings,
  )
  return executeClusterLvmPlan(plan, body.clusterExecution, body, mappings)
})
