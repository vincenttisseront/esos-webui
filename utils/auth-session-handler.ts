/**
 * Session expiry / 401 handling (client-only).
 */
import { shouldSkipAuthMeFetch } from '~/utils/auth-client'
import { shouldHandleUnauthorized } from '~/utils/auth-api'
import { stopAllAppPolling } from '~/utils/app-polling'

let unauthorizedHandling = false

/**
 * Clear session, stop polling, dismiss global errors, redirect to login once.
 */
export async function handleApiUnauthorized(request: string | Request): Promise<void> {
  if (!shouldHandleUnauthorized(request)) return
  if (unauthorizedHandling) return
  unauthorizedHandling = true

  try {
    const auth = useAuthStore()
    const route = useRoute()
    const wasAuthenticated = auth.isAuthenticated

    stopAllAppPolling()
    auth.clearSession()
    useErrorStore().dismissAll()

    if (wasAuthenticated && !shouldSkipAuthMeFetch(route.path)) {
      await navigateTo('/login')
    }
  } finally {
    unauthorizedHandling = false
  }
}
