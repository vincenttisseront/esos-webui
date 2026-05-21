import { defineStore } from 'pinia'
import type { ESOSVersionReport } from '~/server/utils/types'
import { singleFlight } from '~/utils/single-flight'
import { isUnauthorizedError } from '~/utils/auth-api'

const CLIENT_REFRESH_THROTTLE_MS = 5 * 60 * 1000

export const useESOSVersionStore = defineStore('esosVersion', {
  state: () => ({
    report: null as ESOSVersionReport | null,
    loading: false,
    error: null as string | null,
    lastFetchAt: null as number | null,
    refreshThrottled: false,
  }),

  getters: {
    isOutdated: (s) => s.report && !['up-to-date', 'on-master', 'unknown'].includes(s.report.diff),
    isMasterBuild: (s) => s.report?.installed.buildType === 'master',
    diffColor: (s): string => ({
      'up-to-date': 'green',
      'patch': 'blue',
      'minor': 'amber',
      'major': 'red',
      'on-master': 'purple',
      'unknown': 'gray',
    }[s.report?.diff ?? 'unknown'] ?? 'gray'),
    githubSourceLabel: (s): string | null => {
      const src = s.report?.githubMeta?.source
      if (!src) return null
      return src
    },
  },

  actions: {
    async fetch(forceRefresh = false) {
      if (!useAuthStore().isAuthenticated) return

      const now = Date.now()
      if (
        forceRefresh
        && this.lastFetchAt
        && now - this.lastFetchAt < CLIENT_REFRESH_THROTTLE_MS
      ) {
        this.refreshThrottled = true
        return
      }
      this.refreshThrottled = false

      this.loading = true
      this.error = null
      try {
        const url = forceRefresh ? '/api/admin/esos-version?refresh=1' : '/api/admin/esos-version'
        this.report = await singleFlight(url, () => $fetch<ESOSVersionReport>(url))
        this.lastFetchAt = Date.now()
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) return
        const e = err as { data?: { message?: string; code?: string }; message?: string; statusCode?: number }
        if (e.statusCode === 429 || e.data?.code === 'github.refresh_throttled') {
          this.refreshThrottled = true
          return
        }
        this.error = e.data?.message ?? e.message ?? 'Erreur lors du chargement'
      } finally {
        this.loading = false
      }
    },
  },
})
