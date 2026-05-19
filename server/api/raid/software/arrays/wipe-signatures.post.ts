/**
 * POST /api/raid/software/arrays/wipe-signatures — Effacer les signatures RAID restantes (destructif, explicite).
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import {
  expectedMdAdvancedCleanupConfirmation,
  validateWipeSignatureMembers,
  wipeMdSignatures,
} from '../../../../utils/raid-md-actions'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { invalidateCacheKey, withCache } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import {
  assertClusteredSanAllowsMutation,
  runClusterWipeMdSignatures,
  runLocalWipeMdSignatures,
} from '../../../../utils/raid-cluster-md-execution'
import { assertMutualExclusiveClusterAndLocal } from '../../../../utils/raid-local-recovery'
import type { WipeMdSignaturesRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<WipeMdSignaturesRequest>(event)

  const members = Array.isArray(body?.members) ? body.members.map(String) : []
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
  }

  if (body?.mode !== 'advanced') {
    throw createError({
      statusCode: 400,
      statusMessage: 'mode requis : "advanced" pour le nettoyage MD avancé',
    })
  }

  assertMutualExclusiveClusterAndLocal(body?.clusterExecution, body?.localRecovery)

  const clusterCtx = assertClusteredSanAllowsMutation(sanId, body?.clusterExecution, body?.localRecovery)
  if (clusterCtx?.mode === 'local') {
    try {
      return await runLocalWipeMdSignatures(sanId, body!)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur nettoyage signatures RAID (recovery locale)',
        data: err.data,
      })
    }
  }
  if (clusterCtx?.mode === 'cluster') {
    try {
      return await runClusterWipeMdSignatures(sanId, body!)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? 'Erreur nettoyage signatures RAID cluster',
        data: err.data,
      })
    }
  }

  const expectedConfirm = expectedMdAdvancedCleanupConfirmation()
  if (!body?.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const cacheKey = `raid-overview-${sanId}`
    const overview = await withCache(cacheKey, 60_000, () => collectRaidOverview(manager))
    const blockers = validateWipeSignatureMembers(members, overview.blockDevices, overview.mdArrays)
    if (blockers.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: blockers[0],
        data: { blockers },
      })
    }

    const result = await wipeMdSignatures(
      manager,
      members,
      body.remainingSignatureTypes,
      body.detectionSourcesByMember,
    )
    invalidateCacheKey(cacheKey)
    return { mode: 'standalone' as const, ...result }
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? 'Erreur nettoyage signatures RAID',
      message: err.message ?? err.statusMessage,
      data: err.data,
    })
  }
})
