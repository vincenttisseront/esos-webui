import { getSanSummary } from '../../../db/repositories/san.repository'
import { runClusterLvmPreflight } from '../../../utils/lvm-cluster-preflight'
import type { LvmPreflightRequest } from '../../../utils/lvm-types'

export default defineEventHandler(async (event) => {
  const body = await readBody<LvmPreflightRequest & { clusterId: string; primarySanId: string }>(event)
  if (!body?.clusterId || !body?.primarySanId || !body?.action) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId, primarySanId et action requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId invalide pour ce cluster' })
  }
  return runClusterLvmPreflight(body.clusterId, body.primarySanId, body)
})
