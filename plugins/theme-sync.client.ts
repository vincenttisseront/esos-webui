/**
 * Applique `users.preferred_theme` au color-mode client après chargement de la session.
 * Le cookie `esos_theme` reste la source SSR ; la DB prime lorsqu'elle est définie.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const { applyUserPreference } = useEsosTheme()

  watch(
    () => auth.user?.preferredTheme,
    (theme) => {
      if (theme) applyUserPreference(theme)
    },
    { immediate: true },
  )
})
