import { defineStore } from 'pinia'

export type WSStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

interface TerminalState {
  wsStatus: WSStatus
  errorMsg: string | null
  connectedAt: Date | null
  sessionCount: number
}

export const useTerminalStore = defineStore('terminal', {
  state: (): TerminalState => ({
    wsStatus: 'idle',
    errorMsg: null,
    connectedAt: null,
    sessionCount: 0,
  }),

  getters: {
    isConnected: (s) => s.wsStatus === 'open',
    statusLabel: (s): string =>
      ({
        idle: 'Non connecté',
        connecting: 'Connexion...',
        open: 'Connecté à ESOS',
        closed: 'Déconnecté',
        error: 'Erreur',
      }[s.wsStatus]),
  },

  actions: {
    setStatus(status: WSStatus, errorMsg?: string) {
      this.wsStatus = status
      this.errorMsg = errorMsg ?? null
      if (status === 'open') {
        this.connectedAt = new Date()
        this.sessionCount += 1
      }
    },
  },
})
