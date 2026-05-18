/**
 * POST /api/raid/software/arrays/zero-superblocks — Supprimer les superblocks MD (destructif).
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { expectedMdZeroSuperblocksConfirmation, zeroMdSuperblocks } from '../../../../utils/raid-md-actions'
import { invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'
import type { ZeroMdSuperblocksRequest } from '../../../../utils/raid-types'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const body = await readBody<ZeroMdSuperblocksRequest>(event)

  const arrayName = body?.name ?? 'md0'
  const members = Array.isArray(body?.members) ? body.members.map(String) : []
  if (members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
  }

  const expectedConfirm = expectedMdZeroSuperblocksConfirmation(arrayName)
  if (!body?.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await zeroMdSuperblocks(manager, members)
    invalidateCacheKey(`raid-overview-${sanId}`)
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
