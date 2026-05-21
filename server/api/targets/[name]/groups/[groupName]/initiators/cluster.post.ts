import { getSanSummary } from '~/server/db/repositories/san.repository'
import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { assertScstClusterSuccess, clusterAddInitiator } from '~/server/utils/scst-cluster-mutation'
import { validateInitiatorValue, type InitiatorType } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{
    initiator?: string
    type?: InitiatorType
    ibOneTargetPerPort?: boolean
    clusterId?: string
    primarySanId?: string
  }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const v = validateInitiatorValue(body.initiator ?? '', {
    type: body.type ?? 'auto',
    ibOneTargetPerPort: body.ibOneTargetPerPort,
  })
  if (!v.ok || !v.normalized) {
    throw createError({ statusCode: 400, message: v.message ?? 'initiator invalide' })
  }

  const result = await clusterAddInitiator(
    body.clusterId,
    targetName,
    groupName,
    v.normalized,
    body.type,
  )
  assertScstClusterSuccess(result)

  return {
    success: true,
    initiator: result.initiator ?? v.normalized,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
