/**
 * POST /api/raid/software/arrays/{name}/devices/plan — Plan d'ajout membre MD multi-nœud.
 */
import { requireSanIdQuery } from '../../../../../../../utils/san-query'
import { getSanSummary } from '../../../../../../../db/repositories/san.repository'
import {
  assertClusteredSanAllowsMutation,
  buildAddMdMemberExecutionPlanForCluster,
} from '../../../../../../../utils/raid-cluster-md-execution'
import type { AddMdMemberRequest } from '../../../../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const name = getRouterParam(event, 'name')
  const body = await readBody<AddMdMemberRequest>(event)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'name requis' })
  if (!body?.device) throw createError({ statusCode: 400, statusMessage: 'device requis' })
  if (!body.intent) throw createError({ statusCode: 400, statusMessage: 'intent requis' })

  const san = getSanSummary(sanId)
  if (!san?.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'Plan cluster requis uniquement pour un SAN clusterisé' })
  }
  assertClusteredSanAllowsMutation(sanId, body.clusterExecution)

  return await buildAddMdMemberExecutionPlanForCluster(sanId, name, body)
})
