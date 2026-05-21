import { defineStore } from 'pinia'
import type { HardwareOverview, Alert } from '~/server/utils/types'

interface HardwareState {
  data: HardwareOverview | null
  alerts: Alert[]
  loading: boolean
  pollInterval: ReturnType<typeof setInterval> | null
}

export const useHardwareStore = defineStore('hardware', {
  state: (): HardwareState => ({
    data: null,
    alerts: [],
    loading: false,
    pollInterval: null,
  }),

  getters: {
    hasAlerts: (state): boolean => state.alerts.length > 0,
    criticalAlerts: (state): Alert[] =>
      state.alerts.filter((a) => a.level === 'error'),
    warningAlerts: (state): Alert[] =>
      state.alerts.filter((a) => a.level === 'warning'),
    alertCount: (state): number => state.alerts.length,

    allPortsOnline: (state): boolean =>
      state.data !== null &&
      state.data.fcPorts.length > 0 &&
      state.data.fcPorts.every((p) => p.portState === 'Online'),

    dataVolume: (state): typeof state.data extends null ? null : import('~/server/utils/types').VolumeUsage | null => {
      if (!state.data) return null as never
      return (
        state.data.volumes.find((v) => v.mountpoint === '/mnt/vdisks/fs01') ??
        null
      ) as never
    },
  },

  actions: {
    async fetch() {
      this.loading = true
      try {
        const { effective } = useSelectedSan()
        const query = effective.value ? { sanId: effective.value.id } : {}
        const [hw, alerts] = await Promise.all([
          $fetch<HardwareOverview>('/api/hardware', { query }),
          $fetch<Alert[]>('/api/alerts', { query }),
        ])
        this.data = hw
        this.alerts = alerts
      } catch {
        // Silently keep stale data on poll errors
      } finally {
        this.loading = false
      }
    },

    reset() {
      this.data = null
      this.alerts = []
    },

    startPolling(intervalMs = 15_000) {
      if (!useAuthStore().isAuthenticated) return
      this.stopPolling()
      this.fetch()
      this.pollInterval = setInterval(() => {
        this.fetch()
      }, intervalMs)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})
