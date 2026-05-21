/**
 * Global $fetch hook: 401 on protected APIs → stop polling and redirect to login.
 */
import { isUnauthorizedError } from '~/utils/auth-api'
import { handleApiUnauthorized } from '~/utils/auth-session-handler'

export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  const baseFetch = globalThis.$fetch

  globalThis.$fetch = Object.assign(
    async (request: Parameters<typeof $fetch>[0], opts?: Parameters<typeof $fetch>[1]) => {
      try {
        return await baseFetch(request, opts)
      } catch (err) {
        if (isUnauthorizedError(err)) {
          await handleApiUnauthorized(
            typeof request === 'string' ? request : String(request),
          )
        }
        throw err
      }
    },
    baseFetch,
  ) as typeof $fetch
})
