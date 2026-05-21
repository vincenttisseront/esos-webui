import { defineStore } from 'pinia'
import { shouldSkipAuthMeFetch } from '~/utils/auth-client'

interface AuthUser {
  id: string
  username: string
  role: string
  active: boolean
  authSource: 'local' | 'ldap' | 'oidc'
  forcePasswordChange: boolean
  lastLoginAt: string | null
  preferredLocale: string | null
}

export const useAuthStore = defineStore('auth', () => {
  // useState instead of ref: Nuxt serialises it into the SSR payload and
  // restores it on the client *before* Vue hydrates the DOM, which prevents
  // hydration mismatches caused by role-conditional rendering in the sidebar
  // and header (authStore.user?.role, authStore.user?.username, …).
  const user    = useState<AuthUser | null>('auth:user',    () => null)
  const fetched = useState<boolean>        ('auth:fetched', () => false)
  const loading = ref(false)

  const isAuthenticated    = computed(() => user.value !== null)
  const mustChangePassword = computed(() => user.value?.forcePasswordChange ?? false)

  async function fetchMe(fetcher: typeof $fetch = $fetch) {
    if (import.meta.client) {
      const path = useRoute().path
      if (shouldSkipAuthMeFetch(path)) {
        user.value = null
        fetched.value = true
        return
      }
    }
    try {
      const result = await fetcher<AuthUser>('/api/auth/me', { ignoreResponseError: true })
      if (result && typeof result === 'object' && 'username' in result) {
        user.value = { ...result, authSource: result.authSource ?? 'local' }
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    } finally {
      fetched.value = true
    }
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const result = await $fetch<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      })
      user.value    = { ...result.user, authSource: result.user.authSource ?? 'local', lastLoginAt: null }
      fetched.value = true
      return user.value
    } finally {
      loading.value = false
    }
  }

  async function loginLdap(username: string, password: string) {
    loading.value = true
    try {
      const result = await $fetch<{ user: AuthUser }>('/api/auth/ldap/login', {
        method: 'POST',
        body: { username, password },
      })
      user.value    = { ...result.user, authSource: result.user.authSource ?? 'ldap', lastLoginAt: null }
      fetched.value = true
      return user.value
    } finally {
      loading.value = false
    }
  }

  async function setPreferredLocale(locale: string | null) {
    const result = await $fetch<{ preferredLocale: string | null }>('/api/auth/preferences', {
      method: 'PATCH',
      body: { preferredLocale: locale },
    })
    if (user.value) {
      user.value = { ...user.value, preferredLocale: result.preferredLocale }
    }
    return result.preferredLocale
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      /* ignore */
    }
    user.value = null
    await navigateTo('/login')
  }

  async function changePassword(newPassword: string) {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: { newPassword },
    })
    if (user.value) user.value = { ...user.value, forcePasswordChange: false }
  }

  return {
    user,
    loading,
    fetched,
    isAuthenticated,
    mustChangePassword,
    fetchMe,
    login,
    loginLdap,
    logout,
    changePassword,
    setPreferredLocale,
  }
})
