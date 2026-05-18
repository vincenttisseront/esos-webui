/**
 * GET /api/raid/operations/[id] (SDD v3.12 §8.5).
 */
import { getRaidOperation } from '../../../utils/raid-operations-store'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id requis' })

  const op = getRaidOperation(id)
  if (!op) throw createError({ statusCode: 404, statusMessage: `Opération ${id} introuvable` })

  return op
})
