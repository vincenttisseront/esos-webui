import { getSanSummary } from '~/server/db/repositories/san.repository'
import { decodeTargetParam } from '~/server/utils/scst-api-helpers'
import { assertScstClusterSuccess, clusterCreateGroup } from '~/server/utils/scst-cluster-mutation'
import { validateGroupName } from '~/utils/scst-initiator-validation'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)
  const body = await readBody<{ groupName?: string; clusterId?: string; primarySanId?: string }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const v = validateGroupName(body.groupName ?? '')
  if (!v.ok || !v.normalized) {
    throw createError({ statusCode: 400, message: v.message ?? 'groupName invalide' })
  }

  const result = await clusterCreateGroup(body.clusterId, targetName, v.normalized)
  assertScstClusterSuccess(result)

  return {
    success: true,
    groupName: v.normalized,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
