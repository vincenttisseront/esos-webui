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
import type { ZeroMdSuperblocksRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<ZeroMdSuperblocksRequest>(event)

  const members = Array.isArray(body?.members) ? body.members.map(String) : []
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
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
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur nettoyage superblocks MD',
      data: err.data,
    })
  }
})
