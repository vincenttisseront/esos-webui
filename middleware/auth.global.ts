import { useAuthStore } from '~/stores/auth'

/**
 * Garde de routes globale (cf. SDD v2.1 §10.2).
 *
 * - Hors `/login`, exige une session valide.
 * - Si `forcePasswordChange` actif, force le passage par
 *   `/admin/change-password`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const auth = useAuthStore()
  if (!auth.fetched) {
    // useRequestFetch() forwarde les cookies de la requête entrante côté SSR
    await auth.fetchMe(useRequestFetch())
  }

  if (!auth.isAuthenticated) {
    return navigateTo('/login')
  }

  if (auth.mustChangePassword && to.path !== '/admin/change-password') {
    return navigateTo('/admin/change-password')
  }

  // Pages réservées aux rôles operator+ (viewer exclu)
  const viewerBlockedPaths = ['/admin/dependencies', '/admin/cluster', '/admin/performance']
  const isTerminalTab = to.path.includes('/system-config') && to.query.tab === 'terminal'
  const isPerfTab = to.path.includes('/performance')
  const isViewerBlocked =
    viewerBlockedPaths.some((p) => to.path.startsWith(p)) ||
    isTerminalTab ||
    isPerfTab ||
    to.path.endsWith('/raid')
  if (auth.user?.role === 'viewer' && isViewerBlocked) {
    return navigateTo('/')
  }

  // Pre-fetch SANs list so AppHeader renders the same content on SSR and client.
  // useState() transfers the server value to the client via the Nuxt payload,
  // so as long as the data is loaded here, the initial hydration will match.
  // useRequestFetch() forwards the session cookie so the /api/admin/sans call
  // is authenticated during SSR.
  const sanSelector = useSelectedSan()
  if (!sanSelector.loading.value && !sanSelector.sans.value.length) {
    await sanSelector.fetchSans(useRequestFetch())
  }
})
