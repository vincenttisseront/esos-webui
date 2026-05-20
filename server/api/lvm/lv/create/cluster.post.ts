import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsLvmMutation,
  buildClusterLvCreatePlan,
  executeClusterLvmPlan,
} from '../../../../utils/lvm-cluster-execution'
import type { LvCreatePayload } from '../../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<LvCreatePayload & {
    clusterExecution: { primarySanId: string; clusterId?: string }
  }>(event)
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Exécution cluster requise pour un SAN clusterisé' })
  }
  const clusterInfo = assertClusteredSanAllowsLvmMutation(sanId, body.clusterExecution)
  const clusterId = body.clusterExecution.clusterId ?? clusterInfo!.clusterId
  const plan = await buildClusterLvCreatePlan(
    body.clusterExecution.primarySanId,
    clusterId,
    body,
  )
  return executeClusterLvmPlan(plan, body.clusterExecution, body)
})
