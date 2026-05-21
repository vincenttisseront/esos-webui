import { SESSION_COOKIE } from '../../utils/jwt'
import {
  authenticateSessionFromToken,
  mapSessionAuthFailureToHttp,
} from '../../utils/session-auth'
import { setPreferredLocale, setPreferredTheme } from '../../db/repositories/user.repository'
import { isSupportedLocale, setLocaleCookie } from '../../utils/locale'
import { isSupportedTheme, setThemeCookie } from '../../utils/theme'

/**
 * Met à jour les préférences de l'utilisateur connecté.
 *
 * Body : { preferredLocale?: 'fr' | 'en' | null, preferredTheme?: 'light' | 'dark' | 'system' | null }
 *
 * - Met à jour `users.preferred_locale` / `users.preferred_theme`.
 * - Synchronise les cookies `esos_locale` / `esos_theme` pour SSR cohérent.
 */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE.name)
  const auth  = await authenticateSessionFromToken(token)
  if (!auth.ok) {
    const { statusCode, message } = mapSessionAuthFailureToHttp(auth.failure)
    throw createError({ statusCode, message })
  }

  const body = await readBody<{
    preferredLocale?: string | null
    preferredTheme?: string | null
  }>(event)

  const out: { preferredLocale?: string | null; preferredTheme?: string | null } = {}

  if (body && 'preferredLocale' in body) {
    const raw = body.preferredLocale ?? null
    if (raw !== null && !isSupportedLocale(raw)) {
      throw createError({
        statusCode: 400,
        message: 'Langue non supportée',
        data: { code: 'auth.unsupported_locale' },
      })
    }
    await setPreferredLocale(auth.user.id, raw)
    if (raw) setLocaleCookie(event, raw)
    out.preferredLocale = raw
  }

  if (body && 'preferredTheme' in body) {
    const raw = body.preferredTheme ?? null
    if (raw !== null && !isSupportedTheme(raw)) {
      throw createError({
        statusCode: 400,
        message: 'Thème non supporté',
        data: { code: 'auth.unsupported_theme' },
      })
    }
    await setPreferredTheme(auth.user.id, raw)
    if (raw) setThemeCookie(event, raw)
    out.preferredTheme = raw
  }

  return out
})
