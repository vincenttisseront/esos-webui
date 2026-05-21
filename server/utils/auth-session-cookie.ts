import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'
import { signSession, SESSION_COOKIE } from './jwt'
import type { UserRow } from '../db/repositories/user.repository'
import { updateLastLogin, recordLoginEvent } from '../db/repositories/user.repository'
import type { UserRole } from './types'
import { isSupportedLocale, setLocaleCookie } from './locale'
import { isSupportedTheme, setThemeCookie } from './theme'

export async function setSessionCookieForUser(event: H3Event, user: UserRow): Promise<void> {
  const token = await signSession({
    userId:         user.id,
    username:       user.username,
    role:           user.role as UserRole,
    sessionVersion: user.sessionVersion,
  })
  setCookie(event, SESSION_COOKIE.name, token, SESSION_COOKIE.options)

  // Propage la préférence de langue stockée (si présente) vers le cookie i18n,
  // pour que le SSR du prochain rendu corresponde aux préférences utilisateur.
  if (isSupportedLocale(user.preferredLocale)) {
    setLocaleCookie(event, user.preferredLocale)
  }

  if (isSupportedTheme(user.preferredTheme)) {
    setThemeCookie(event, user.preferredTheme)
  }

  await updateLastLogin(user.id)
  await recordLoginEvent(
    user.id,
    true,
    getRequestIP(event) ?? undefined,
    getRequestHeader(event, 'user-agent') ?? undefined,
  ).catch(() => {/* non-bloquant */})
}
