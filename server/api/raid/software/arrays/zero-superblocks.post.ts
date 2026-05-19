/**
 * POST /api/raid/software/arrays/zero-superblocks — Supprimer les superblocks MD (destructif).
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import {
  expectedMdZeroMetadataConfirmation,
  validateZeroSuperblockMembers,
  zeroMdSuperblocks,
} from '../../../../utils/raid-md-actions'
import { collectRaidOverview } from '../../../../utils/raid-overview.service'
import { invalidateCacheKey, withCache } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import {
  assertClusteredSanAllowsMutation,
  runClusterZeroMdSuperblocks,
  runLocalZeroMdSuperblocks,
} from '../../../../utils/raid-cluster-md-execution'
import { assertMutualExclusiveClusterAndLocal } from '../../../../utils/raid-local-recovery'
import type { ZeroMdSuperblocksRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<ZeroMdSuperblocksRequest>(event)

  const members = Array.isArray(body?.members) ? body.members.map(String) : []
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
  }

  const mode = body?.mode === 'advanced' ? 'advanced' : 'basic'
  if (mode === 'advanced') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Utilisez POST /api/raid/software/arrays/wipe-signatures avec mode: "advanced" pour le nettoyage avancé',
    })
  }

  assertMutualExclusiveClusterAndLocal(body?.clusterExecution, body?.localRecovery)

  const clusterCtx = assertClusteredSanAllowsMutation(sanId, body?.clusterExecution, body?.localRecovery)
  if (clusterCtx?.mode === 'local') {
    try {
      return await runLocalZeroMdSuperblocks(sanId, body!)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur nettoyage superblocks MD (recovery locale)',
        data: err.data,
      })
    }
  }
  if (clusterCtx?.mode === 'cluster') {
    try {
      return await runClusterZeroMdSuperblocks(sanId, body!)
    } catch (err: any) {
      throw createError({
        statusCode: err.statusCode ?? 500,
        statusMessage: err.statusMessage ?? err.message ?? 'Erreur nettoyage superblocks MD cluster',
        data: err.data,
      })
    }
  }

  const expectedConfirm = expectedMdZeroMetadataConfirmation()
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
    const blockers = validateZeroSuperblockMembers(members, overview.blockDevices, overview.mdArrays)
    if (blockers.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: blockers[0],
        data: { blockers },
      })
    }

    const result = await zeroMdSuperblocks(manager, members)
    invalidateCacheKey(cacheKey)
    return { mode: 'standalone' as const, ...result }
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? 'Erreur nettoyage superblocks MD',
      message: err.message ?? err.statusMessage,
      data: err.data,
    })
  }
})
