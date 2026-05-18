import { getSanSummary } from '../../../db/repositories/san.repository'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id requis' })
  }
  const san = getSanSummary(id)
  if (!san) {
    throw createError({ statusCode: 404, statusMessage: 'SAN inconnu' })
  }
  return san
})
