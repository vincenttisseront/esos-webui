/**
 * POST /api/raid/software/arrays/zero-superblocks/plan — Plan nettoyage zero MD cluster (sans écriture).
 */
import { requireSanIdQuery } from '../../../../../utils/san-query'
import { getSanSummary } from '../../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsMutation,
  buildZeroMdClusterExecutionPlan,
  toClusterMdExecutionPlan,
} from '../../../../../utils/raid-cluster-md-execution'
import type { ZeroMdSuperblocksRequest } from '../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<ZeroMdSuperblocksRequest>(event)
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsMutation(sanId, body?.clusterExecution)
  const plan = await buildZeroMdClusterExecutionPlan(body)
  return toClusterMdExecutionPlan(
    'zero_md_superblocks',
    body.clusterExecution!.primarySanId,
    body.clusterExecution!.clusterId ?? san.clusterId,
    {
      nodeResults: plan.nodeResults,
      recoveryAssessment: plan.recoveryAssessment,
      recoveryMode: plan.recoveryMode ?? undefined,
      planToken: plan.planToken,
      confirmationPhrase: plan.confirmationPhrase,
      okSymmetric: plan.recoveryAssessment.okSymmetric,
      okDegraded: plan.recoveryAssessment.okDegraded,
    },
  )
})
