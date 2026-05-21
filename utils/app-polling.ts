/**
 * Central start/stop for authenticated background polling (stores + event for page timers).
 */

export const AUTH_STOP_POLLING_EVENT = 'auth:stop-polling' as const

export function stopAllAppPolling(): void {
  if (import.meta.server) return

  useSSHStore().stopPolling()
  useOverviewStore().stopPolling()
  useStatsStore().stopPolling()
  useHardwareStore().stopPolling()
  useClusterStore().stopPolling()
  usePerfStore().stopPolling()
  useRaidStore().stopPolling()

  useEventBus<void>(AUTH_STOP_POLLING_EVENT).emit()
}

/** Core dashboard polling (SSH, overview, stats). Requires authenticated session. */
export function startCoreAppPolling(): void {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return

  useSSHStore().startPolling()
  useOverviewStore().startPolling()
  useStatsStore().startPolling()
}
