import { shouldSkipAuthMeFetch } from '~/utils/auth-client'
import { startCoreAppPolling, stopAllAppPolling } from '~/utils/app-polling'

export default defineNuxtPlugin(async (nuxtApp) => {
  const sanSelector = useSelectedSan()
  const auth = useAuthStore()
  const appVersionStore = useAppVersionStore()
  const route = useRoute()

  appVersionStore.fetchVersion().catch(() => {})

  if (!auth.fetched && !shouldSkipAuthMeFetch(route.path)) {
    await auth.fetchMe(useRequestFetch())
  }

  if (auth.isAuthenticated) {
    // Skip the initial fetch if the middleware already loaded SANs via SSR payload.
    // This prevents a pre-hydration re-fetch that would cause hydration mismatches.
    // AppHeader refreshes SANs every 15 s on its own, keeping data current.
    if (!sanSelector.sans.value.length) {
      await sanSelector.fetchSans()
    }

    // Defer polling until AFTER Vue has hydrated the app.
    nuxtApp.hook('app:mounted', () => {
      if (auth.isAuthenticated) startCoreAppPolling()
    })
  }

  // Pause polling when tab is hidden, resume on visibility (only when authenticated)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAllAppPolling()
      } else if (auth.isAuthenticated) {
        startCoreAppPolling()
      }
    })
  }
})
