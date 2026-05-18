import { defineStore } from 'pinia'
import type { ESOSVersionReport } from '~/server/utils/types'

export const useESOSVersionStore = defineStore('esosVersion', {
  state: () => ({
    report:  null as ESOSVersionReport | null,
    loading: false,
    error:   null as string | null,
  }),

  getters: {
    isOutdated:    (s) => s.report && !['up-to-date', 'on-master', 'unknown'].includes(s.report.diff),
    isMasterBuild: (s) => s.report?.installed.buildType === 'master',
    diffColor:     (s): string => ({
      'up-to-date': 'green',
      'patch':      'blue',
      'minor':      'amber',
      'major':      'red',
      'on-master':  'purple',
      'unknown':    'gray',
    }[s.report?.diff ?? 'unknown'] ?? 'gray'),
  },

  actions: {
    async fetch(forceRefresh = false) {
      this.loading = true
      this.error   = null
      try {
        const url   = forceRefresh ? '/api/admin/esos-version?refresh=1' : '/api/admin/esos-version'
        this.report = await $fetch<ESOSVersionReport>(url)
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string }
        this.error = e.data?.message ?? e.message ?? 'Erreur lors du chargement'
      } finally {
        this.loading = false
      }
    },
  },
})
