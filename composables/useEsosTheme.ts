import type { SupportedTheme } from '~/server/utils/theme'
import { isSupportedTheme } from '~/server/utils/theme'

export type ThemePreference = SupportedTheme

/**
 * Thème ESOS : wrapper autour de `useColorMode` + persistance auth.
 */
export function useEsosTheme() {
  const colorMode = useColorMode()
  const authStore = useAuthStore()

  const preference = computed<ThemePreference>({
    get() {
      const p = colorMode.preference
      return isSupportedTheme(p) ? p : 'system'
    },
    set(value: ThemePreference) {
      colorMode.preference = value
    },
  })

  const resolved = computed(() => colorMode.value)

  function applyUserPreference(preferredTheme: string | null | undefined) {
    if (isSupportedTheme(preferredTheme)) {
      colorMode.preference = preferredTheme
    }
  }

  async function setPreference(theme: ThemePreference) {
    colorMode.preference = theme
    if (authStore.isAuthenticated) {
      await authStore.setPreferredTheme(theme)
    }
  }

  return {
    preference,
    resolved,
    applyUserPreference,
    setPreference,
  }
}
