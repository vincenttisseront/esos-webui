// composables/useEsosI18n.ts
// Wrapper autour de useI18n() qui :
//  - garantit un fallback français explicite pour la migration progressive
//    des pages (les composants partiellement migrés peuvent passer le
//    littéral français comme deuxième argument).
//  - centralise la résolution d'un code d'erreur serveur (ex. `auth.invalid_credentials`)
//    vers la clé `errors.<code>`.
//
// Usage :
//   const { t, tWithFallback, tError, locale, setLocale } = useEsosI18n()
//   t('nav.items.dashboard')
//   tWithFallback('common.actions.save', 'Enregistrer')
//   tError(err) // -> traduit `data.code` si présent, sinon `data.message`/`message`

import type { Composer } from 'vue-i18n'
import { API_ERROR_CODE_I18N_ALIASES } from '~/server/utils/i18n-error-codes'

type ApiError = {
  data?: { code?: string; message?: string }
  message?: string
} | null | undefined

/** Resolve `data.code` to a vue-i18n key (errors.* or alias). */
export function apiErrorCodeToI18nKey(code: string): string {
  if (code in API_ERROR_CODE_I18N_ALIASES) {
    return API_ERROR_CODE_I18N_ALIASES[code]!
  }
  if (code === 'san.read_only') {
    return 'storage.readonly.errors.san_read_only'
  }
  return `errors.${code}`
}

/**
 * i18n for Pinia actions, timers, and other callbacks outside `setup`.
 * `useI18n()` must run at setup top-level; this uses the Nuxt app composer instead.
 */
export function getEsosI18n(): Pick<Composer, 't' | 'te' | 'locale'> {
  const i18n = useNuxtApp().$i18n as Composer
  return i18n
}

export function useEsosI18n() {
  const i18n = useI18n() as Composer

  function tWithFallback(key: string, fallbackFr: string, named?: Record<string, unknown>): string {
    const exists = i18n.te(key)
    if (!exists) return fallbackFr
    return named ? (i18n.t(key, named) as string) : (i18n.t(key) as string)
  }

  function tError(err: ApiError, fallback = i18n.t('errors.auth.generic') as string): string {
    const data = err?.data
    if (data?.code) {
      const key = apiErrorCodeToI18nKey(data.code)
      if (i18n.te(key)) return i18n.t(key) as string
    }
    return data?.message ?? err?.message ?? fallback
  }

  function tRaidAlert(alert: { code?: string; params?: Record<string, unknown>; message: string }): string {
    if (alert.code) {
      const key = `raid.alerts.${alert.code}`
      if (i18n.te(key)) {
        return alert.params
          ? (i18n.t(key, alert.params) as string)
          : (i18n.t(key) as string)
      }
    }
    return alert.message
  }

  function tLvmAlert(alert: { code?: string; params?: Record<string, unknown>; message: string }): string {
    if (alert.code) {
      const key = `lvm.alerts.${alert.code}`
      if (i18n.te(key)) {
        return alert.params
          ? (i18n.t(key, alert.params) as string)
          : (i18n.t(key) as string)
      }
    }
    return alert.message
  }

  async function setLocale(code: string) {
    await i18n.setLocale(code as never)
  }

  return {
    t: i18n.t,
    te: i18n.te,
    locale: i18n.locale,
    locales: i18n.locales,
    setLocale,
    tWithFallback,
    tError,
    tRaidAlert,
    tLvmAlert,
  }
}
