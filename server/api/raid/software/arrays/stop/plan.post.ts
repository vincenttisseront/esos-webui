/**
 * POST /api/raid/software/arrays/stop/plan — Plan d'arrêt MD multi-nœud (sans écriture).
 */
import { requireSanIdQuery } from '../../../../../utils/san-query'
import { getSanSummary } from '../../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsMutation,
  buildStopMdClusterExecutionPlan,
  toClusterMdExecutionPlan,
} from '../../../../../utils/raid-cluster-md-execution'
import type { ClusterMdExecutionRequest } from '../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<{ name?: string; clusterExecution?: ClusterMdExecutionRequest }>(event)
  const name = body?.name
  if (!name) throw createError({ statusCode: 400, statusMessage: 'name requis' })
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsMutation(sanId, body?.clusterExecution)

  const plan = await buildStopMdClusterExecutionPlan({
    clusterId: body!.clusterExecution!.clusterId ?? san.clusterId,
    primarySanId: body!.clusterExecution!.primarySanId,
    arrayName: name,
    diskMappings: body!.clusterExecution!.diskMappings,
    recoveryMode: body!.clusterExecution!.recoveryMode,
  })

  return toClusterMdExecutionPlan(
    'stop_md',
    body!.clusterExecution!.primarySanId,
    body!.clusterExecution!.clusterId ?? san.clusterId,
    {
      nodeResults: plan.nodeResults,
      recoveryAssessment: plan.recoveryAssessment,
      recoveryMode: plan.recoveryMode,
      planToken: plan.planToken,
      confirmationPhrase: plan.confirmationPhrase,
      okSymmetric: plan.recoveryAssessment.okSymmetric,
      okDegraded: plan.recoveryAssessment.okDegraded,
    },
  )
})
