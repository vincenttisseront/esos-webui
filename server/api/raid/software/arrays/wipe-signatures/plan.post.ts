/**
 * POST /api/raid/software/arrays/wipe-signatures/plan — Plan nettoyage avancé MD cluster (sans écriture).
 */
import { requireSanIdQuery } from '../../../../../utils/san-query'
import { getSanSummary } from '../../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsMutation,
  buildWipeMdClusterExecutionPlan,
  toClusterMdExecutionPlan,
} from '../../../../../utils/raid-cluster-md-execution'
import type { WipeMdSignaturesRequest } from '../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<WipeMdSignaturesRequest>(event)
  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsMutation(sanId, body?.clusterExecution)
  const { nodeResults } = await buildWipeMdClusterExecutionPlan(body)
  return toClusterMdExecutionPlan(
    'wipe_md_signatures',
    body.clusterExecution!.primarySanId,
    body.clusterExecution!.clusterId ?? san.clusterId,
    { nodeResults },
  )
})
