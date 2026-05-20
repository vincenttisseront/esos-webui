import { getSanSummary } from '../../../db/repositories/san.repository'
import {
  bindScstPreflightHasConflictOnly,
} from '../../../utils/lvm-cluster-bind-scst-preflight'
import { runClusterLvmPreflight } from '../../../utils/lvm-cluster-preflight'
import type { ClusterLvmPreflightResult, LvmPreflightRequest } from '../../../utils/lvm-types'

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return 'Erreur interne du préflight cluster'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<LvmPreflightRequest & { clusterId: string; primarySanId: string }>(event)
  if (!body?.clusterId || !body?.primarySanId || !body?.action) {
    throw createError({ statusCode: 400, message: 'clusterId, primarySanId et action requis' })
  }
  const san = getSanSummary(body.primarySanId)
  if (!san?.clusterId || san.clusterId !== body.clusterId) {
    throw createError({ statusCode: 400, message: 'primarySanId invalide pour ce cluster' })
  }

  const context = `action=${body.action} clusterId=${body.clusterId} primarySanId=${body.primarySanId}`

  try {
    const result: ClusterLvmPreflightResult = await runClusterLvmPreflight(
      body.clusterId,
      body.primarySanId,
      body,
    )

    if (!result.ok && body.action === 'bind_scst' && bindScstPreflightHasConflictOnly(result.blockers)) {
      throw createError({
        statusCode: 409,
        message: 'Conflit SCST : device ou chemin LV déjà utilisé sur un ou plusieurs nœuds',
        data: { preflight: result },
      })
    }

    return result
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      throw err
    }
    console.error(`[lvm/cluster/preflight] ${context}`, err)
    throw createError({
      statusCode: 500,
      message: 'Erreur interne du préflight cluster',
      data: { context, detail: errorMessage(err) },
    })
  }
})
