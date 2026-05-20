import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import { assertClusteredSanAllowsLvmMutation, buildClusterLvRemovePlan } from '../../../../utils/lvm-cluster-execution'
import type { LvRemovePayload } from '../../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<LvRemovePayload & { clusterExecution?: { primarySanId: string; clusterId?: string } }>(event)
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsLvmMutation(sanId, body.clusterExecution as any)
  return buildClusterLvRemovePlan(
    body.clusterExecution!.primarySanId,
    body.clusterExecution!.clusterId ?? san.clusterId,
    body,
  )
})
