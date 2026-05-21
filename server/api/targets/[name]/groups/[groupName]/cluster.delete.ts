import { getSanSummary } from '~/server/db/repositories/san.repository'
import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { assertScstClusterSuccess, clusterDeleteGroup } from '~/server/utils/scst-cluster-mutation'
import { expectedDeleteGroupConfirmation } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{
    clusterId?: string
    primarySanId?: string
    force?: boolean
    confirmation?: string
  }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  if (body.force && body.confirmation) {
    const expected = expectedDeleteGroupConfirmation(targetName, groupName)
    if (body.confirmation.trim() !== expected) {
      throw createError({ statusCode: 400, message: `Confirmation requise : ${expected}` })
    }
  }

  const result = await clusterDeleteGroup(body.clusterId, targetName, groupName, body.force)
  assertScstClusterSuccess(result)

  return {
    success: true,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
