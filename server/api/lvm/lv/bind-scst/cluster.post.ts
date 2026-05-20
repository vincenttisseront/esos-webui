import { requireSanIdQuery } from '../../../../utils/san-query'
import { getSanSummary } from '../../../../db/repositories/san.repository'
import { collectClusterLvmInventory } from '../../../../utils/lvm-cluster-preflight'
import {
  assertBindScstClusterSuccess,
  executeBindScstOnClusterNodes,
} from '../../../../utils/lvm-cluster-bind-scst-execution'
import { validateBindScstClusterPayload } from '../../../../utils/lvm-cluster-bind-scst-preflight'
import { expectedBindScstConfirmation } from '../../../../utils/lvm-validation'
import type { BindScstPayload } from '../../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<BindScstPayload & {
    clusterId: string
    primarySanId: string
  }>(event)

  if (!body?.clusterId || !body?.primarySanId) {
    throw createError({ statusCode: 400, message: 'clusterId et primarySanId requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const validated = validateBindScstClusterPayload(body)
  if (!validated.ok) {
    throw createError({ statusCode: 400, message: validated.message })
  }
  const payload = validated.payload
  const expected = expectedBindScstConfirmation(payload.deviceName)
  if (payload.confirmation.trim() !== expected) {
    throw createError({ statusCode: 400, message: `Confirmation requise : ${expected}` })
  }

  const nodes = await collectClusterLvmInventory(body.clusterId)
  const result = await executeBindScstOnClusterNodes(nodes, payload)
  assertBindScstClusterSuccess(result)

  return {
    success: true,
    deviceName: result.deviceName,
    nodeResults: result.nodeResults,
    refreshedSanIds: result.refreshedSanIds,
  }
})
