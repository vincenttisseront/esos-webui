import type { H3Event } from 'h3'

export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: SupportedLocale = 'fr'
export const LOCALE_COOKIE = 'esos_locale'

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Définit le cookie de langue côté serveur. Lu par `@nuxtjs/i18n`
 * via `detectBrowserLanguage.cookieKey` au prochain rendu SSR.
 */
export function setLocaleCookie(event: H3Event, locale: SupportedLocale): void {
  setCookie(event, LOCALE_COOKIE, locale, {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Variante pure (testable) de la résolution de locale.
 * Ordre :
 *   1. Préférence utilisateur (DB) si fournie et supportée.
 *   2. Valeur du cookie `esos_locale` si supportée.
 *   3. Locale par défaut.
 */
export function pickLocale(
  userPreferredLocale: string | null | undefined,
  cookieValue: string | null | undefined,
): SupportedLocale {
  if (isSupportedLocale(userPreferredLocale)) return userPreferredLocale
  if (isSupportedLocale(cookieValue)) return cookieValue
  return DEFAULT_LOCALE
}

/**
 * Résout la locale pour une requête H3. Utilise le cookie `esos_locale`
 * et la préférence utilisateur stockée en DB.
 */
export function resolveLocale(
  event: H3Event,
  userPreferredLocale: string | null | undefined,
): SupportedLocale {
  return pickLocale(userPreferredLocale, getCookie(event, LOCALE_COOKIE))
}
