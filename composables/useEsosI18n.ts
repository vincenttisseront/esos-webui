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

type ApiError = {
  data?: { code?: string; message?: string }
  message?: string
} | null | undefined

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
      const key = `errors.${data.code}`
      if (i18n.te(key)) return i18n.t(key) as string
    }
    return data?.message ?? err?.message ?? fallback
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
  }
}
