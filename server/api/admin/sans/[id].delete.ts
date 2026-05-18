import { deleteSan } from '../../../db/repositories/san.repository'
import { getSSHPool } from '../../../utils/ssh-pool'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id requis' })
  }

  await getSSHPool().remove(id)
  const removed = deleteSan(id)
  if (!removed) {
    throw createError({ statusCode: 404, statusMessage: 'SAN inconnu' })
  }
  return { ok: true }
})
