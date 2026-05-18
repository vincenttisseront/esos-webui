import { SESSION_COOKIE } from '../../utils/jwt'
import {
  authenticateSessionFromToken,
  mapSessionAuthFailureToHttp,
} from '../../utils/session-auth'
import { setPreferredLocale } from '../../db/repositories/user.repository'
import { isSupportedLocale, setLocaleCookie } from '../../utils/locale'

/**
 * Met à jour les préférences de l'utilisateur connecté.
 * Pour l'instant, expose uniquement `preferredLocale`.
 *
 * Body : { preferredLocale: 'fr' | 'en' | null }
 *
 * - Met à jour `users.preferred_locale`.
 * - Synchronise le cookie `esos_locale` pour SSR cohérent.
 */
export default defineEventHandler(async (event) => {
  const token = getCookie(event, SESSION_COOKIE.name)
  const auth  = await authenticateSessionFromToken(token)
  if (!auth.ok) {
    const { statusCode, message } = mapSessionAuthFailureToHttp(auth.failure)
    throw createError({ statusCode, message })
  }

  const body = await readBody<{ preferredLocale?: string | null }>(event)
  const raw  = body?.preferredLocale ?? null

  if (raw !== null && !isSupportedLocale(raw)) {
    throw createError({
      statusCode: 400,
      message: 'Langue non supportée',
      data: { code: 'auth.unsupported_locale' },
    })
  }

  await setPreferredLocale(auth.user.id, raw)

  if (raw) {
    setLocaleCookie(event, raw)
  }

  return { preferredLocale: raw }
})
