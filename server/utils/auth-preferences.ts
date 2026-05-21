import { isSupportedLocale } from './locale'
import { isSupportedTheme } from './theme'

export type PreferencesPatchInput = {
  preferredLocale?: string | null
  preferredTheme?: string | null
}

export type PreferencesValidationError = {
  field: 'preferredLocale' | 'preferredTheme'
  code: 'auth.unsupported_locale' | 'auth.unsupported_theme'
  message: string
}

/**
 * Valide le corps PATCH /api/auth/preferences.
 * Seuls `preferredLocale` et `preferredTheme` sont acceptés (pas d'autres champs utilisateur).
 */
export function validatePreferencesPatch(
  body: unknown,
): { ok: true; patch: PreferencesPatchInput } | { ok: false; error: PreferencesValidationError } {
  if (body === null || body === undefined || typeof body !== 'object') {
    return { ok: true, patch: {} }
  }

  const record = body as Record<string, unknown>
  const patch: PreferencesPatchInput = {}

  if ('preferredLocale' in record) {
    const raw = record.preferredLocale === undefined ? null : (record.preferredLocale as string | null)
    if (raw !== null && !isSupportedLocale(raw)) {
      return {
        ok: false,
        error: {
          field: 'preferredLocale',
          code: 'auth.unsupported_locale',
          message: 'Langue non supportée',
        },
      }
    }
    patch.preferredLocale = raw
  }

  if ('preferredTheme' in record) {
    const raw = record.preferredTheme === undefined ? null : (record.preferredTheme as string | null)
    if (raw !== null && !isSupportedTheme(raw)) {
      return {
        ok: false,
        error: {
          field: 'preferredTheme',
          code: 'auth.unsupported_theme',
          message: 'Thème non supporté',
        },
      }
    }
    patch.preferredTheme = raw
  }

  return { ok: true, patch }
}

export function hasPreferencePatchFields(patch: PreferencesPatchInput): boolean {
  return 'preferredLocale' in patch || 'preferredTheme' in patch
}
