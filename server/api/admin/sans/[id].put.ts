import {
  updateSan,
  type UpdateSanInput,
} from '../../../db/repositories/san.repository'
import { getSSHPool } from '../../../utils/ssh-pool'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id requis' })
  }
  const body = await readBody<UpdateSanInput>(event)
  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Body invalide' })
  }

  const ok = updateSan(id, body)
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'SAN inconnu' })
  }

  // Si l'on touche aux credentials ou à l'host/port/username, le manager
  // courant doit être recréé pour prendre en compte les nouveaux paramètres.
  const needsReconnect =
    body.authType !== undefined ||
    body.privateKey !== undefined ||
    body.password !== undefined ||
    body.host !== undefined ||
    body.port !== undefined ||
    body.username !== undefined ||
    body.status === 'inactive'

  if (needsReconnect) {
    const pool = getSSHPool()
    await pool.remove(id)
    if (body.status !== 'inactive') {
      pool.getOrCreate(id).catch((err) =>
        console.error(`[SSH] Reconnect ${id} failed:`, err.message),
      )
    }
  }

  return { ok: true }
})
