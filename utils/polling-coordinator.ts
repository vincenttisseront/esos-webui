/**
 * Central registry for authenticated background polling (visibility + auth gates).
 */

export type PollerHandle = {
  name: string
  start: () => void
  stop: () => void
  tick?: () => void | Promise<void>
}

const pollers = new Map<string, PollerHandle>()
let paused = false
let started = false

const OVERVIEW_ROUTES = new Set(['/', '/targets', '/devices', '/sessions'])
const STATS_ROUTES = new Set(['/stats'])

function debugPoll(msg: string): void {
  if (import.meta.dev && import.meta.client) {
    console.debug(`[poll] ${msg}`)
  }
}

export function registerPoller(handle: PollerHandle): void {
  pollers.set(handle.name, handle)
}

export function unregisterPoller(name: string): void {
  const p = pollers.get(name)
  if (p) p.stop()
  pollers.delete(name)
}

export function isPollingPaused(): boolean {
  return paused
}

export function pauseAllPolling(): void {
  if (paused) return
  paused = true
  debugPoll('pauseAll')
  for (const p of pollers.values()) p.stop()
}

export function resumeAllPolling(): void {
  if (!paused) return
  paused = false
  debugPoll('resumeAll')
  if (!started) return
  startRegisteredPollers()
}

function canPoll(): boolean {
  if (import.meta.server) return false
  if (paused) return false
  if (typeof document !== 'undefined' && document.hidden) return false
  const auth = useAuthStore()
  return auth.isAuthenticated
}

function routeAllows(name: string): boolean {
  const path = useRoute().path
  if (name === 'overview') {
    return OVERVIEW_ROUTES.has(path) || path.startsWith('/targets/')
  }
  if (name === 'stats') {
    return STATS_ROUTES.has(path)
  }
  return true
}

export function startRegisteredPollers(): void {
  if (!canPoll()) return
  started = true
  for (const [name, p] of pollers) {
    if (!routeAllows(name)) {
      p.stop()
      continue
    }
    debugPoll(`start ${name}`)
    p.start()
  }
}

export function stopAllRegisteredPollers(): void {
  started = false
  debugPoll('stopAll')
  for (const p of pollers.values()) p.stop()
}

export function setupPollingVisibilityListener(): void {
  if (import.meta.server || typeof document === 'undefined') return

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseAllPolling()
    } else {
      resumeAllPolling()
    }
  })
}

export function isOverviewRoute(path?: string): boolean {
  const p = path ?? useRoute().path
  return OVERVIEW_ROUTES.has(p) || p.startsWith('/targets/')
}

export function isStatsRoute(path?: string): boolean {
  return STATS_ROUTES.has(path ?? useRoute().path)
}
