import type { H3Event } from 'h3'

export const SUPPORTED_THEMES = ['light', 'dark', 'system'] as const
export type SupportedTheme = (typeof SUPPORTED_THEMES)[number]
export const DEFAULT_THEME: SupportedTheme = 'system'
export const THEME_COOKIE = 'esos_theme'

export function isSupportedTheme(value: unknown): value is SupportedTheme {
  return typeof value === 'string' && (SUPPORTED_THEMES as readonly string[]).includes(value)
}

/**
 * Définit le cookie de thème côté serveur. Lu par `@nuxtjs/color-mode`
 * (`storageKey: esos_theme`) au prochain rendu SSR.
 */
export function setThemeCookie(event: H3Event, theme: SupportedTheme): void {
  setCookie(event, THEME_COOKIE, theme, {
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  })
}

/**
 * Variante pure (testable) de la résolution de thème.
 * Ordre :
 *   1. Préférence utilisateur (DB) si fournie et supportée.
 *   2. Valeur du cookie `esos_theme` si supportée.
 *   3. Thème par défaut (`system`).
 */
export function pickTheme(
  userPreferredTheme: string | null | undefined,
  cookieValue: string | null | undefined,
): SupportedTheme {
  if (isSupportedTheme(userPreferredTheme)) return userPreferredTheme
  if (isSupportedTheme(cookieValue)) return cookieValue
  return DEFAULT_THEME
}

export function resolveTheme(
  event: H3Event,
  userPreferredTheme: string | null | undefined,
): SupportedTheme {
  return pickTheme(userPreferredTheme, getCookie(event, THEME_COOKIE))
}
