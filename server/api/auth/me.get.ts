import { SESSION_COOKIE } from '../../utils/jwt'
import { getUserById } from '../../db/repositories/user.repository'
import {
  authenticateSessionFromToken,
  mapSessionAuthFailureToHttp,
} from '../../utils/session-auth'

export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE.name)
  const auth  = await authenticateSessionFromToken(token)
  if (!auth.ok) {
    const { statusCode, message } = mapSessionAuthFailureToHttp(auth.failure)
    throw createError({ statusCode, message })
  }

  const row = await getUserById(auth.user.id)
  if (!row) {
    throw createError({ statusCode: 401, message: 'Utilisateur introuvable' })
  }

  return {
    id:                  row.id,
    username:            row.username,
    role:                row.role,
    active:              row.active,
    authSource:          row.authSource ?? 'local',
    forcePasswordChange: row.forcePasswordChange,
    lastLoginAt:         row.lastLoginAt,
    preferredLocale:     row.preferredLocale ?? null,
  }
})
