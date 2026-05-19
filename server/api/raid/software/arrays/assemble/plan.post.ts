/**
 * POST /api/raid/software/arrays/assemble/plan — Plan d'assemblage MD multi-nœud (sans écriture).
 */
import { requireSanIdQuery } from '../../../../../utils/san-query'
import { getSanSummary } from '../../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsMutation,
  buildAssembleMdClusterExecutionPlan,
  toClusterMdExecutionPlan,
} from '../../../../../utils/raid-cluster-md-execution'
import type { AssembleMdArrayRequest } from '../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<AssembleMdArrayRequest>(event)
  if (!body?.name) throw createError({ statusCode: 400, statusMessage: 'name requis' })

  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsMutation(sanId, body.clusterExecution)

  const { nodeResults } = await buildAssembleMdClusterExecutionPlan(body)
  return toClusterMdExecutionPlan(
    'assemble_md',
    body.clusterExecution!.primarySanId,
    body.clusterExecution!.clusterId ?? san.clusterId,
    nodeResults,
  )
})
