/**
 * POST /api/raid/software/arrays/[name]/devices — Ajouter un device à un MD array (SDD v3.12 §8.4).
 */
import { getActiveSSHManager, withSanContext } from '../../../../../utils/ssh-runtime'
import { addMdDevice } from '../../../../../utils/raid-md-actions'
import { invalidateCacheKey } from '../../../../../utils/cache'
import { requireSanIdQuery } from '../../../../../utils/san-query'

export default defineEventHandler(async (event) => {
  const sanId = requireSanIdQuery(event)
  const name = getRouterParam(event, 'name')
  const body = await readBody<{ device: string }>(event)

  if (!name) throw createError({ statusCode: 400, statusMessage: 'name requis' })
  if (!body?.device) throw createError({ statusCode: 400, statusMessage: 'device requis' })

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }
    const result = await addMdDevice(manager, name, body.device)
    invalidateCacheKey(`raid-overview-${sanId}`)
    return result
  }

  try {
    return await withSanContext(sanId, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      statusMessage: err.statusMessage ?? err.message ?? 'Erreur add device MD',
    })
  }
})
