export default defineNuxtPlugin(async (nuxtApp) => {
  const sshStore = useSSHStore()
  const overviewStore = useOverviewStore()
  const statsStore = useStatsStore()
  const sanSelector = useSelectedSan()
  const auth = useAuthStore()
  const appVersionStore = useAppVersionStore()

  // Fetch version info early (no auth required)
  appVersionStore.fetchVersion().catch(() => {})

  // Only load SANs and start polling if already authenticated
  if (!auth.fetched) {
    try {
      await auth.fetchMe(useRequestFetch())
    } catch {
      // not authenticated — skip
    }
  }

  if (auth.isAuthenticated) {
    // Skip the initial fetch if the middleware already loaded SANs via SSR payload.
    // This prevents a pre-hydration re-fetch that would cause hydration mismatches.
    // AppHeader refreshes SANs every 15 s on its own, keeping data current.
    if (!sanSelector.sans.value.length) {
      await sanSelector.fetchSans()
    }

    // Defer polling until AFTER Vue has hydrated the app.
    // startPolling() sets `loading = true` synchronously which would mismatch
    // the SSR-rendered HTML where loading was false.
    nuxtApp.hook('app:mounted', () => {
      sshStore.startPolling()
      overviewStore.startPolling()
      statsStore.startPolling()
    })
  }

  // Pause polling when tab is hidden, resume on visibility
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        sshStore.stopPolling()
        overviewStore.stopPolling()
        statsStore.stopPolling()
      } else {
        sshStore.startPolling()
        overviewStore.startPolling(overviewStore.currentIntervalMs)
        statsStore.startPolling()
      }
    })
  }
})
