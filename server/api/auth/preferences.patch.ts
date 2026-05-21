import { SESSION_COOKIE } from '../../utils/jwt'
import {
  authenticateSessionFromToken,
  mapSessionAuthFailureToHttp,
} from '../../utils/session-auth'
import { setPreferredLocale, setPreferredTheme } from '../../db/repositories/user.repository'
import { setLocaleCookie } from '../../utils/locale'
import { setThemeCookie } from '../../utils/theme'
import {
  hasPreferencePatchFields,
  validatePreferencesPatch,
} from '../../utils/auth-preferences'

/**
 * Met à jour les préférences de l'utilisateur connecté (session courante uniquement).
 *
 * Body : { preferredLocale?: 'fr' | 'en' | null, preferredTheme?: 'light' | 'dark' | 'system' | null }
 *
 * - Met à jour `users.preferred_locale` / `users.preferred_theme` pour `auth.user.id`.
 * - Synchronise les cookies `esos_locale` / `esos_theme` pour SSR cohérent.
 */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE.name)
  const auth  = await authenticateSessionFromToken(token)
  if (!auth.ok) {
    const { statusCode, message } = mapSessionAuthFailureToHttp(auth.failure)
    throw createError({ statusCode, message })
  }

  const body = await readBody(event)
  const validated = validatePreferencesPatch(body)
  if (!validated.ok) {
    const { error } = validated
    throw createError({
      statusCode: 400,
      message: error.message,
      data: { code: error.code },
    })
  }

  const { patch } = validated
  const out: { preferredLocale?: string | null; preferredTheme?: string | null } = {}

  if ('preferredLocale' in patch) {
    const raw = patch.preferredLocale ?? null
    await setPreferredLocale(auth.user.id, raw)
    if (raw) setLocaleCookie(event, raw)
    out.preferredLocale = raw
  }

  if ('preferredTheme' in patch) {
    const raw = patch.preferredTheme ?? null
    await setPreferredTheme(auth.user.id, raw)
    if (raw) setThemeCookie(event, raw)
    out.preferredTheme = raw
  }

  if (!hasPreferencePatchFields(patch)) {
    return out
  }

  return out
})
