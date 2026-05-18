import { defineStore } from 'pinia'
import type { DependenciesReport, PackageDep, SemverDiff, DepType } from '~/server/utils/types'

export const useDepsStore = defineStore('dependencies', {
  state: () => ({
    report: null as DependenciesReport | null,
    loading: false,
    error: null as string | null,
    filterDiff: 'all' as SemverDiff | 'all',
    filterType: 'all' as DepType | 'all',
    filterQuery: '',
  }),

  getters: {
    filtered: (s): PackageDep[] => {
      if (!s.report) return []

      return s.report.packages.filter((p) => {
        if (s.filterDiff !== 'all' && p.diff !== s.filterDiff) return false
        if (s.filterType !== 'all' && p.type !== s.filterType) return false
        if (s.filterQuery) {
          const q = s.filterQuery.toLowerCase()
          if (!p.name.toLowerCase().includes(q)) return false
        }
        return true
      })
    },

    scannedAgo: (s): string => {
      if (!s.report) return ''
      const sec = Math.floor((Date.now() - s.report.scannedAt) / 1000)
      if (sec < 60) return `il y a ${sec}s`
      if (sec < 3600) return `il y a ${Math.floor(sec / 60)}min`
      return `il y a ${Math.floor(sec / 3600)}h`
    },

    majorCount: (s): number => s.report?.majorUpdates ?? 0,
  },

  actions: {
    async fetch(forceRefresh = false) {
      this.loading = true
      this.error = null

      try {
        const url = forceRefresh ? '/api/admin/dependencies?refresh=1' : '/api/admin/dependencies'
        this.report = await $fetch<DependenciesReport>(url)
      } catch (err: any) {
        this.error = err?.data?.statusMessage ?? err?.data?.message ?? 'Erreur lors du chargement'
      } finally {
        this.loading = false
      }
    },
  },
})
