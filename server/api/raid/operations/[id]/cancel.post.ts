/**
 * POST /api/raid/operations/[id]/cancel (SDD v3.12 §8.5).
 */
import { cancelRaidOperation } from '../../../../utils/raid-operations-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })

  const op = cancelRaidOperation(id)
  if (!op) throw createError({ statusCode: 404, statusMessage: `Opération ${id} introuvable` })

  return op
})
