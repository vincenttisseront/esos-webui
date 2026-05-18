import { defineStore } from 'pinia'
import type {
  PerfAgentConfig,
  PerfAgentServiceStatus,
  PerfDeviceSummary,
  PerfDeviceSeries,
  PerfDbTestResult,
  PerfServiceAction,
  BlockDeviceInfo,
} from '~/server/utils/perf-agent-types'

function formatKbps(kbps: number): string {
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(2)} GB/s`
  if (kbps >= 1_000) return `${(kbps / 1_000).toFixed(1)} MB/s`
  return `${Math.round(kbps)} KB/s`
}

export const usePerfStore = defineStore('perf', {
  state: () => ({
    config: null as PerfAgentConfig | null,
    service: null as PerfAgentServiceStatus | null,
    dbTestResult: null as PerfDbTestResult | null,
    devices: [] as PerfDeviceSummary[],
    blockDevices: [] as BlockDeviceInfo[],
    selectedSystem: '',
    selectedDevice: '',
    selectedWindow: '1h' as '15m' | '1h' | '6h' | '24h' | '7d' | '31d',
    series: null as PerfDeviceSeries | null,
    systems: [] as string[],
    loading: false,
    configLoading: false,
    serviceLoading: false,
    dbTestLoading: false,
    error: null as string | null,
    pollTimer: null as ReturnType<typeof setInterval> | null,
    /** SAN ciblé pour toutes les requêtes (null = SAN effectif) */
    sanId: null as string | null,
  }),

  getters: {
    totalReadKbps: (s) => s.devices.reduce((acc, d) => acc + d.readKbps, 0),
    totalWriteKbps: (s) => s.devices.reduce((acc, d) => acc + d.writeKbps, 0),
    totalDeviceRateKbps: (s) => s.devices.reduce((acc, d) => acc + d.deviceRateKbps, 0),
    totalReadFormatted(): string { return formatKbps(this.totalReadKbps as number) },
    totalWriteFormatted(): string { return formatKbps(this.totalWriteKbps as number) },
    hotDevices: (s) => s.devices.filter(d => d.status === 'hot'),
    activeDevices: (s) => s.devices.filter(d => d.status === 'active' || d.status === 'hot'),
    hasStaleDevices: (s) => s.devices.some(d => d.status === 'stale'),
    isConfigured: (s) => !!s.config?.rawExists,
    isDbConfigured: (s) => !!(s.config && s.config.dburiMasked && s.config.dburiMasked !== 'postgres://:@/' && s.config.dburiMasked !== 'mysql://:@/'),
  },

  actions: {
    query() {
      return this.sanId ? { sanId: this.sanId } : {}
    },

    async fetchConfig() {
      this.configLoading = true
      try {
        this.config = await $fetch<PerfAgentConfig>('/api/perf/config', { query: this.query() })
        if (!this.selectedSystem && this.config.system) {
          this.selectedSystem = this.config.system
        }
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? 'Erreur configuration'
      } finally {
        this.configLoading = false
      }
    },

    async saveConfig(update: import('~/server/utils/perf-agent-types').PerfAgentConfigUpdate) {
      this.configLoading = true
      this.error = null
      try {
        this.config = await $fetch<PerfAgentConfig>('/api/perf/config', {
          method: 'PATCH',
          body: update,
          query: this.query(),
        })
        return true
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? 'Erreur sauvegarde'
        return false
      } finally {
        this.configLoading = false
      }
    },

    async fetchService() {
      this.serviceLoading = true
      try {
        this.service = await $fetch<PerfAgentServiceStatus>('/api/perf/service', { query: this.query() })
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? 'Erreur service'
      } finally {
        this.serviceLoading = false
      }
    },

    async serviceAction(action: PerfServiceAction) {
      this.serviceLoading = true
      this.error = null
      try {
        this.service = await $fetch<PerfAgentServiceStatus>('/api/perf/service', {
          method: 'POST',
          body: { action },
          query: this.query(),
        })
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? `Erreur action ${action}`
      } finally {
        this.serviceLoading = false
      }
    },

    async testDb() {
      this.dbTestLoading = true
      this.error = null
      try {
        this.dbTestResult = await $fetch<PerfDbTestResult>('/api/perf/db-test', {
          method: 'POST',
          query: this.query(),
        })
      } catch (err: any) {
        this.dbTestResult = { ok: false, dbType: 'unknown', error: err?.data?.message ?? err.message }
      } finally {
        this.dbTestLoading = false
      }
    },

    async fetchBlockDevices() {
      try {
        this.blockDevices = await $fetch<BlockDeviceInfo[]>('/api/perf/devices', { query: this.query() })
      } catch { /* non bloquant */ }
    },

    async fetchSummary() {
      if (!this.selectedSystem) return
      try {
        this.devices = await $fetch<PerfDeviceSummary[]>('/api/perf/summary', {
          query: { system: this.selectedSystem, ...this.query() },
        })
        if (!this.selectedDevice && this.devices.length > 0) {
          this.selectedDevice = this.devices[0].device
        }
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? 'Erreur résumé'
      }
    },

    async fetchSeries() {
      if (!this.selectedSystem || !this.selectedDevice) return
      try {
        this.series = await $fetch<PerfDeviceSeries>('/api/perf/series', {
          query: {
            system: this.selectedSystem,
            device: this.selectedDevice,
            window: this.selectedWindow,
            ...this.query(),
          },
        })
      } catch (err: any) {
        this.error = err?.data?.message ?? err.message ?? 'Erreur séries'
      }
    },

    async refreshDashboard() {
      this.loading = true
      this.error = null
      try {
        await Promise.all([this.fetchService(), this.fetchSummary()])
        await this.fetchSeries()
      } finally {
        this.loading = false
      }
    },

    startPolling(intervalMs = 30_000) {
      this.refreshDashboard()
      this.pollTimer = setInterval(() => this.refreshDashboard(), intervalMs)
    },

    stopPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer)
      this.pollTimer = null
    },
  },
})
