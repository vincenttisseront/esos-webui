/**
 * DELETE /api/raid/software/arrays/[name] — Stopper et supprimer un MD array (SDD v3.12 §8.4).
 */
import { getActiveSSHManager, withSanContext } from '../../../../utils/ssh-runtime'
import { stopMdArray } from '../../../../utils/raid-md-actions'
import { invalidateCacheKey } from '../../../../utils/cache'
import { requireSanIdQuery } from '../../../../utils/san-query'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const name = getRouterParam(event, 'name')
  const body = await readBody<{ confirmation: string }>(event)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'name requis' })

  const expectedConfirm = `STOP ${name}`
  if (!body?.confirmation || body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await stopMdArray(manager, name)
    invalidateCacheKey(`raid-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur stop MD array',
    })
  }
})
