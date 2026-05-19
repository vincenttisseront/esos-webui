/**
 * POST /api/raid/software/arrays/assemble — Assembler un tableau MD arrêté.
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { assembleMdArray, expectedMdAssembleConfirmation } from '../../../../utils/raid-md-actions'
import { invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import { isValidMdArrayName } from '../../../../utils/stopped-md-arrays'
import {
  assertClusteredSanAllowsMutation,
  runClusterAssembleMdArray,
} from '../../../../utils/raid-cluster-md-execution'
import type { AssembleMdArrayRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<AssembleMdArrayRequest>(event)

  if (!body?.name) {
    throw createError({ statusCode: 400, statusMessage: 'name requis' })
  }
  const effectiveName = body.targetName ?? body.name
  if (!isValidMdArrayName(effectiveName)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Nom de tableau MD invalide — spécifiez un nom cible valide (ex: md0)',
    })
  }

  const clusterCtx = assertClusteredSanAllowsMutation(sanId, body.clusterExecution)
  if (clusterCtx) {
    try {
      return await runClusterAssembleMdArray(sanId, body)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur assemblage MD array cluster',
        data: err.data,
      })
    }
  }

  const expectedConfirm = expectedMdAssembleConfirmation(effectiveName)
  if (!body.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await assembleMdArray(manager, body)
    invalidateCacheKey(`raid-overview-${sanId}`)
    return { mode: 'standalone' as const, ...result }
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur assemblage MD array',
      data: err.data,
    })
  }
})
