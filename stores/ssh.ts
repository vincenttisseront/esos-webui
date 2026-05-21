import { defineStore } from 'pinia'
import { isUnauthorizedError } from '~/utils/auth-api'
import { isPollingPaused } from '~/utils/polling-coordinator'

export type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'unconfigured'

const DEFAULT_POLL_MS = 30_000

function sshPollIntervalMs(): number {
  if (import.meta.client) {
    const cfg = useRuntimeConfig().public.sshStatusPollMs as number | undefined
    if (typeof cfg === 'number' && cfg >= 10_000) return cfg
  }
  return DEFAULT_POLL_MS
}

interface SSHState {
  status: SSHStatus
  configured: boolean
  lastCheckedAt: Date | null
  pollInterval: ReturnType<typeof setInterval> | null
  fetchInFlight: boolean
}

export const useSSHStore = defineStore('ssh', {
  state: (): SSHState => ({
    status: 'connecting',
    configured: true,
    lastCheckedAt: null,
    pollInterval: null,
    fetchInFlight: false,
  }),

  getters: {
    isConfigured: (s) => s.configured,
    isReady: (s) => s.status === 'connected',
    isReconnecting: (s) => s.status === 'reconnecting',
    isError: (s) => s.status === 'error',
    isUnconfigured: (s) => s.status === 'unconfigured',

    statusLabel: (s): string =>
      ({
        connecting: 'Connexion...',
        connected: 'Connecté',
        reconnecting: 'Reconnexion...',
        error: 'Erreur SSH',
        unconfigured: 'Non configure',
      }[s.status]),

    statusKey: (s): string => `ssh.status.${s.status}`,

    statusColor: (s): string =>
      ({
        connecting: 'yellow',
        connected: 'green',
        reconnecting: 'orange',
        error: 'red',
        unconfigured: 'gray',
      }[s.status]),
  },

  actions: {
    async fetchStatus() {
      if (!useAuthStore().isAuthenticated) return
      if (this.fetchInFlight) return
      this.fetchInFlight = true
      try {
        const data = await $fetch<{ status: SSHStatus; configured: boolean }>('/api/ssh-status')
        this.configured = data.configured
        this.setStatus(data.status)
      } catch (err) {
        if (isUnauthorizedError(err)) return
        this.configured = true
        this.setStatus('error')
      } finally {
        this.lastCheckedAt = new Date()
        this.fetchInFlight = false
      }
    },

    setStatus(status: SSHStatus) {
      const prev = this.status
      this.status = status
      if (prev === 'reconnecting' && status === 'connected') {
        useEventBus<void>('ssh:reconnected').emit()
      }
      if (status === 'connected' || status === 'unconfigured') {
        const errorStore = useErrorStore()
        errorStore.clearSource('ssh')
        errorStore.clearSource('overview')
      }
    },

    startPolling() {
      if (!useAuthStore().isAuthenticated) return
      if (isPollingPaused()) return
      if (this.pollInterval) return
      void this.fetchStatus()
      const ms = sshPollIntervalMs()
      this.pollInterval = setInterval(() => {
        if (isPollingPaused()) return
        void this.fetchStatus()
      }, ms)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})
