import {
  getUserByUsername,
  recordLoginEvent,
} from '../../db/repositories/user.repository'
import { verifyPassword } from '../../utils/password'
import { setSessionCookieForUser } from '../../utils/auth-session-cookie'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)

  if (!body?.username || !body.password) {
    throw createError({
      statusCode: 400,
      message: 'Identifiants manquants',
      data: { code: 'auth.missing_credentials' },
    })
  }

  const ip        = getRequestIP(event) ?? undefined
  const userAgent = getRequestHeader(event, 'user-agent') ?? undefined

  const user = await getUserByUsername(body.username)
  const valid = user
    && user.authSource === 'local'
    && user.passwordHash
    ? await verifyPassword(user.passwordHash, body.password)
    : false

  if (!valid || !user) {
    if (user) {
      await recordLoginEvent(user.id, false, ip, userAgent).catch(() => {/* non-bloquant */})
    }
    await new Promise((r) => setTimeout(r, 500))
    throw createError({
      statusCode: 401,
      message: 'Identifiants incorrects',
      data: { code: 'auth.invalid_credentials' },
    })
  }

  if (!user.active) {
    await recordLoginEvent(user.id, false, ip, userAgent).catch(() => {/* non-bloquant */})
    throw createError({
      statusCode: 403,
      message: 'Compte désactivé. Contactez un administrateur.',
      data: { code: 'auth.inactive' },
    })
  }

  await setSessionCookieForUser(event, user)

  return {
    user: {
      id:                  user.id,
      username:            user.username,
      role:                user.role,
      active:              user.active,
      authSource:          user.authSource ?? 'local',
      forcePasswordChange: user.forcePasswordChange,
      preferredLocale:     user.preferredLocale ?? null,
    },
  }
})
