/**
 * Central start/stop for authenticated background polling (stores + event for page timers).
 */

import {
  isPollingPaused,
  pauseAllPolling,
  registerPoller,
  resumeAllPolling,
  setupPollingVisibilityListener,
  startRegisteredPollers,
  stopAllRegisteredPollers,
  unregisterPoller,
} from '~/utils/polling-coordinator'

export const AUTH_STOP_POLLING_EVENT = 'auth:stop-polling' as const

let coordinatorBootstrapped = false

function ensureCoordinator(): void {
  if (coordinatorBootstrapped || import.meta.server) return
  coordinatorBootstrapped = true

  const ssh = useSSHStore()
  const overview = useOverviewStore()
  const stats = useStatsStore()

  registerPoller({
    name: 'ssh',
    start: () => ssh.startPolling(),
    stop: () => ssh.stopPolling(),
  })
  registerPoller({
    name: 'overview',
    start: () => overview.startPolling(),
    stop: () => overview.stopPolling(),
  })
  registerPoller({
    name: 'stats',
    start: () => stats.startPolling(),
    stop: () => stats.stopPolling(),
  })

  setupPollingVisibilityListener()
}

export function stopAllAppPolling(): void {
  if (import.meta.server) return
  ensureCoordinator()
  stopAllRegisteredPollers()
  useEventBus<void>(AUTH_STOP_POLLING_EVENT).emit()
}

/** Core dashboard polling (SSH, overview on dashboard routes, stats on /stats). */
export function startCoreAppPolling(): void {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.isAuthenticated) return

  ensureCoordinator()
  resumeAllPolling()
  startRegisteredPollers()
}

export function registerPagePoller(
  name: string,
  start: () => void,
  stop: () => void,
): void {
  ensureCoordinator()
  unregisterPoller(name)
  registerPoller({ name, start, stop })
  if (!isPollingPaused() && useAuthStore().isAuthenticated) {
    start()
  }
}

export function unregisterPagePoller(name: string): void {
  unregisterPoller(name)
}
