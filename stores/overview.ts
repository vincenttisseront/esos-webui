import { defineStore } from 'pinia'
import type { Overview } from '~/types/esos'
import { createEmptyOverview } from '~/types/esos'
import { isUnauthorizedError } from '~/utils/auth-api'
import { isOverviewRoute, isPollingPaused } from '~/utils/polling-coordinator'

interface OverviewState {
  data: Overview | null
  loading: boolean
  error: string | null
  lastRefresh: Date | null
  pollInterval: ReturnType<typeof setInterval> | null
  currentIntervalMs: number
  reconnectBound: boolean
  fetchInFlight: boolean
}

const DEFAULT_INTERVAL = 30_000

export const useOverviewStore = defineStore('overview', {
  state: (): OverviewState => ({
    data: null,
    loading: false,
    error: null,
    lastRefresh: null,
    pollInterval: null,
    currentIntervalMs: DEFAULT_INTERVAL,
    reconnectBound: false,
    fetchInFlight: false,
  }),

  getters: {
    targets: (s) => s.data?.targets ?? [],
    devices: (s) => s.data?.devices ?? [],
    sessions: (s) => s.data?.sessions ?? [],
    stats: (s) => s.data?.stats,

    hasData: (s) => s.data !== null,
    isStale: (s): boolean => {
      if (!s.lastRefresh) return true
      return Date.now() - s.lastRefresh.getTime() > 60_000
    },
  },

  actions: {
    async fetch() {
      if (!useAuthStore().isAuthenticated) return
      if (this.fetchInFlight) return
      this.fetchInFlight = true

      const sshStore = useSSHStore()

      if (sshStore.isUnconfigured) {
        this.data = createEmptyOverview()
        this.error = null
        this.lastRefresh = new Date()
        this.fetchInFlight = false
        return
      }

      if (sshStore.isError) {
        this.error = 'Connexion SSH indisponible'
        this.fetchInFlight = false
        return
      }

      this.loading = true
      this.error = null

      try {
        const { effective, selectedCluster } = useSelectedSan()
        const query = selectedCluster.value
          ? { clusterId: selectedCluster.value.id }
          : effective.value ? { sanId: effective.value.id } : {}
        const data = await $fetch<Overview>('/api/overview', { query })
        this.data = data
        this.lastRefresh = new Date()
        this.error = null
        useErrorStore().clearSource('overview')
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) return
        const fetchErr = err as { statusCode?: number; message?: string; data?: { message?: string } }
        this.error = fetchErr.data?.message ?? fetchErr.message ?? 'Erreur de chargement'
        // Page-local only — do not push to global error banner
      } finally {
        this.loading = false
        this.fetchInFlight = false
      }
    },

    startPolling(intervalMs = DEFAULT_INTERVAL) {
      if (!useAuthStore().isAuthenticated) return
      if (!isOverviewRoute()) return
      if (isPollingPaused()) return
      this.stopPolling()
      this.currentIntervalMs = intervalMs
      void this.fetch()
      this.pollInterval = setInterval(() => {
        if (!isOverviewRoute() || isPollingPaused()) return
        void this.fetch()
      }, intervalMs)

      if (!this.reconnectBound) {
        this.reconnectBound = true
        useEventBus<void>('ssh:reconnected').on(() => {
          // Refresh forcé sur reconnexion SSH
          this.fetch()
        })
      }
    },

    reset() {
      this.data = null
      this.error = null
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },

    setPollingInterval(ms: number) {
      this.startPolling(ms)
    },

    invalidate() {
      this.data = null
      this.lastRefresh = null
    },
  },
})
