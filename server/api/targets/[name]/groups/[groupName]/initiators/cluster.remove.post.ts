import { getSanSummary } from '~/server/db/repositories/san.repository'
import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { assertScstClusterSuccess, clusterRemoveInitiator } from '~/server/utils/scst-cluster-mutation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{
    initiator?: string
    clusterId?: string
    primarySanId?: string
  }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const initiator = body.initiator?.trim()
  if (!initiator) {
    throw createError({ statusCode: 400, message: 'initiator requis' })
  }

  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const result = await clusterRemoveInitiator(body.clusterId, targetName, groupName, initiator)
  assertScstClusterSuccess(result)

  return {
    success: true,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
