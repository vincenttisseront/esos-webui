import { useAuthStore } from '~/stores/auth'

/**
 * Garde de routes globale (cf. SDD v2.1 §10.2).
 *
 * - Tente le SSO Bastion (headers) avant toute redirection /login.
 * - Si déjà authentifié sur /login → renvoie vers /.
 * - Si `forcePasswordChange` actif, force `/admin/change-password`.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  const requestFetch = useRequestFetch()

  if (!auth.fetched) {
    // useRequestFetch() forwarde les cookies de la requête entrante côté SSR
    await auth.fetchMe(requestFetch)
  }

  async function tryHeaderSso(): Promise<boolean> {
    try {
      const providers = await requestFetch<{
        providers: Array<{ key: string; available: boolean; loginUrl?: string }>
      }>('/api/auth/providers')
      const header = providers.providers.find((p) => p.key === 'header' && p.available)
      if (!header?.loginUrl) return false
      await requestFetch(header.loginUrl)
      await auth.fetchMe(requestFetch)
      return auth.isAuthenticated
    } catch {
      return false
    }
  }

  if (!auth.isAuthenticated) {
    await tryHeaderSso()
  }

  // Already signed in (cookie or just-established header SSO) → leave login page
  if (to.path === '/login') {
    if (auth.isAuthenticated) {
      return navigateTo('/')
    }
    return
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
