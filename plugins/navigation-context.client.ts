/**
 * Sync route ↔ selection context and redirect off cluster routes when context is invalid.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const sanSelector = useSelectedSan()
  const route = useRoute()
  const nav = useNavigationContext()

  function applyRouteSync() {
    if (!auth.isAuthenticated) return
    nav.applyRouteToSelection()
  }

  function applyRedirectGuard() {
    if (!auth.isAuthenticated) return
    const redirect = nav.invalidClusterRedirect()
    if (redirect) {
      void navigateTo(redirect)
    }
  }

  watch(
    () => [route.path, JSON.stringify(route.query)],
    () => {
      applyRouteSync()
      applyRedirectGuard()
    },
    { flush: 'post' },
  )

  watch(
    () => sanSelector.selectedId.value,
    () => {
      applyRedirectGuard()
    },
    { flush: 'post' },
  )

  onMounted(() => {
    applyRouteSync()
    applyRedirectGuard()
  })
})
