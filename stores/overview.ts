import { defineStore } from 'pinia'
import type { Overview } from '~/types/esos'
import { createEmptyOverview } from '~/types/esos'

interface OverviewState {
  data: Overview | null
  loading: boolean
  error: string | null
  lastRefresh: Date | null
  pollInterval: ReturnType<typeof setInterval> | null
  currentIntervalMs: number
  reconnectBound: boolean
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
      const sshStore = useSSHStore()

      if (sshStore.isUnconfigured) {
        this.data = createEmptyOverview()
        this.error = null
        this.lastRefresh = new Date()
        return
      }

      if (sshStore.isError) {
        this.error = 'Connexion SSH indisponible'
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
      } catch (err: unknown) {
        const fetchErr = err as { statusCode?: number; message?: string }
        this.error = fetchErr.message ?? 'Erreur de chargement'

        const errorStore = useErrorStore()
        errorStore.push({
          level: fetchErr.statusCode === 503 ? 'warning' : 'error',
          message: this.error,
          source: 'overview',
          code: fetchErr.statusCode,
        })
      } finally {
        this.loading = false
      }
    },

    startPolling(intervalMs = DEFAULT_INTERVAL) {
      this.stopPolling()
      this.currentIntervalMs = intervalMs
      this.fetch()
      this.pollInterval = setInterval(() => this.fetch(), intervalMs)

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
