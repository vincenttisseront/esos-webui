import { defineStore } from 'pinia'

export type ErrorLevel = 'info' | 'warning' | 'error'
export type ErrorSource = 'ssh' | 'overview' | 'target' | 'terminal' | 'parser'
export type ErrorKind = 'ssh_disconnected' | 'refresh_failed' | 'stale_data'

export interface AppError {
  id: string
  level: ErrorLevel
  message: string
  source: ErrorSource
  kind?: ErrorKind
  endpoint?: string
  code?: number
  timestamp: Date
  dismissed: boolean
}

interface ErrorState {
  errors: AppError[]
  maxErrors: number
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(6)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    const t = Date.now()
    for (let i = 0; i < bytes.length; i++) bytes[i] = (t + i * 17) & 0xff
  }
  return `err-${Date.now()}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export const useErrorStore = defineStore('error', {
  state: (): ErrorState => ({
    errors: [],
    maxErrors: 20,
  }),

  getters: {
    active: (s): AppError[] => s.errors.filter((e) => !e.dismissed),

    latest: (s): AppError | null =>
      s.errors
        .filter((e) => !e.dismissed && e.level === 'error')
        .at(-1) ?? null,

    hasSSHError: (s): boolean =>
      s.errors.some((e) => !e.dismissed && e.source === 'ssh'),

    /** Errors that must not open the global SSH banner (page-local only). */
    nonGlobalActive: (s): AppError[] =>
      s.errors.filter((e) => !e.dismissed && e.source !== 'ssh'),

    activeCount: (s): number => s.errors.filter((e) => !e.dismissed).length,
  },

  actions: {
    push(err: Omit<AppError, 'id' | 'timestamp' | 'dismissed'>) {
      const last = this.errors.at(-1)
      if (last && last.message === err.message && !last.dismissed) return

      this.errors.push({
        ...err,
        id: newId(),
        timestamp: new Date(),
        dismissed: false,
      })

      if (this.errors.length > this.maxErrors) {
        this.errors.shift()
      }
    },

    dismiss(id: string) {
      const err = this.errors.find((e) => e.id === id)
      if (err) err.dismissed = true
    },

    dismissAll() {
      this.errors.forEach((e) => {
        e.dismissed = true
      })
    },

    clearSource(source: ErrorSource) {
      this.errors = this.errors.filter((e) => e.source !== source)
    },
  },
})
