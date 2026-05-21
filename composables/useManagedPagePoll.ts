import { registerPagePoller, unregisterPagePoller } from '~/utils/app-polling'
import { isPollingPaused } from '~/utils/polling-coordinator'
import { isUnauthorizedError } from '~/utils/auth-api'

/**
 * Register a page-scoped interval poller with auth + visibility gates.
 */
export function useManagedPagePoll(
  name: string,
  tick: () => void | Promise<void>,
  intervalMs: number,
) {
  let timer: ReturnType<typeof setInterval> | null = null

  async function safeTick() {
    if (!useAuthStore().isAuthenticated) return
    if (isPollingPaused()) return
    try {
      await tick()
    } catch (err) {
      if (isUnauthorizedError(err)) return
      throw err
    }
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function start() {
    stop()
    if (!useAuthStore().isAuthenticated) return
    void safeTick()
    timer = setInterval(() => void safeTick(), intervalMs)
  }

  onMounted(() => {
    registerPagePoller(name, start, stop)
  })

  onBeforeUnmount(() => {
    stop()
    unregisterPagePoller(name)
  })

  return { refresh: safeTick, stop, start }
}
