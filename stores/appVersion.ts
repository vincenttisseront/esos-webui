import { defineStore } from 'pinia'

export interface StoredAppVersion {
  id: 'global'
  version: string
  build?: string
  gitCommit?: string
  gitBranch?: string
  buildDate?: string
  environment?: string
  dbSchemaVersion: number
  updatedAt: string
  transient?: boolean
}

export interface AppVersionHistoryEntry {
  id: string
  version: string
  previousVersion?: string
  build?: string
  previousBuild?: string
  gitCommit?: string
  previousGitCommit?: string
  gitBranch?: string
  buildDate?: string
  dbSchemaVersion: number
  appliedAt: string
  source: 'startup' | 'migration' | 'manual' | 'ci'
  notes?: string
}

export const useAppVersionStore = defineStore('appVersion', {
  state: () => ({
    version: null as StoredAppVersion | null,
    history: [] as AppVersionHistoryEntry[],
    loading: false,
    error: null as string | null,
  }),

  getters: {
    label: (s): string =>
      s.version ? `v${s.version.version}` : 'v?.?.?',

    shortCommit: (s): string | undefined =>
      s.version?.gitCommit?.slice(0, 7),

    fullLabel: (s): string => {
      if (!s.version) return 'Unknown version'
      const parts = [`v${s.version.version}`]
      if (s.version.build)     parts.push(`build ${s.version.build}`)
      if (s.version.gitCommit) parts.push(s.version.gitCommit.slice(0, 7))
      return parts.join(' · ')
    },
  },

  actions: {
    async fetchVersion() {
      this.loading = true
      this.error   = null
      try {
        this.version = await $fetch<StoredAppVersion>('/api/app/version')
      } catch (err) {
        this.error = (err as Error).message
      } finally {
        this.loading = false
      }
    },

    async fetchHistory(limit = 50) {
      try {
        this.history = await $fetch<AppVersionHistoryEntry[]>('/api/admin/app-version/history', {
          query: { limit },
        })
      } catch {
        this.history = []
      }
    },

    async refresh() {
      this.version = await $fetch<StoredAppVersion>('/api/admin/app-version/refresh', {
        method: 'POST',
      })
    },
  },
})
