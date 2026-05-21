import { getSanSummary } from '~/server/db/repositories/san.repository'
import { decodeGroupParam, decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { assertScstClusterSuccess, clusterAddLunToGroup } from '~/server/utils/scst-cluster-mutation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const groupName = decodeGroupParam(event)
  const body = await readBody<{
    lunId?: number
    deviceName?: string
    readOnly?: boolean
    clusterId?: string
    primarySanId?: string
  }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  if (body.lunId == null || !body.deviceName) {
    throw createError({ statusCode: 400, message: 'lunId et deviceName requis' })
  }

  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const result = await clusterAddLunToGroup(
    body.clusterId,
    targetName,
    groupName,
    body.lunId,
    body.deviceName,
    body.readOnly,
  )
  assertScstClusterSuccess(result)

  return {
    success: true,
    lunId: body.lunId,
    deviceName: body.deviceName,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
