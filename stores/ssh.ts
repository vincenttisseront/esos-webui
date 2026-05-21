import { defineStore } from 'pinia'
import { isUnauthorizedError } from '~/utils/auth-api'

export type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error' | 'unconfigured'

interface SSHState {
  status: SSHStatus
  configured: boolean
  lastCheckedAt: Date | null
  pollInterval: ReturnType<typeof setInterval> | null
}

export const useSSHStore = defineStore('ssh', {
  state: (): SSHState => ({
    status: 'connecting',
    configured: true,
    lastCheckedAt: null,
    pollInterval: null,
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
      try {
        const data = await $fetch<{ status: SSHStatus; configured: boolean }>('/api/ssh-status')
        this.configured = data.configured
        this.setStatus(data.status)
      } catch (err) {
        if (isUnauthorizedError(err)) return
        this.configured = true
        this.setStatus('error')
      }
      this.lastCheckedAt = new Date()
    },

    setStatus(status: SSHStatus) {
      const prev = this.status
      this.status = status
      if (prev === 'reconnecting' && status === 'connected') {
        useEventBus<void>('ssh:reconnected').emit()
      }
      if (status === 'connected' || status === 'unconfigured') {
        // Erreurs SSH/overview obsolètes au retour de la connexion
        const errorStore = useErrorStore()
        errorStore.clearSource('ssh')
        errorStore.clearSource('overview')
      }
    },

    startPolling() {
      if (!useAuthStore().isAuthenticated) return
      if (this.pollInterval) return
      this.fetchStatus()
      this.pollInterval = setInterval(() => this.fetchStatus(), 5_000)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})
