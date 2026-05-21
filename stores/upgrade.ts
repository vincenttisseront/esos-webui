import { defineStore } from 'pinia'
import type { UpgradePlan, UpgradePackageStatus, UpgradeReadinessReport } from '~/types/upgrade'
import { singleFlight, singleFlightKey } from '~/utils/single-flight'
import { isUnauthorizedError } from '~/utils/auth-api'

const READINESS_THROTTLE_MS = 30_000

export const useUpgradeStore = defineStore('upgrade', {
  getters: {
    versionAvailability: state => state.readiness?.versionAvailability ?? null,
    readinessThrottled: (state): boolean => {
      if (!state.lastReadinessFetchAt) return false
      return Date.now() - state.lastReadinessFetchAt < READINESS_THROTTLE_MS
    },
  },

  state: () => ({
    readiness: null as UpgradeReadinessReport | null,
    readinessLoading: false,
    readinessError: null as string | null,
    lastReadinessFetchAt: null as number | null,
    packageStatus: null as UpgradePackageStatus | null,
    packageLoading: false,
    packageError: null as string | null,
    plan: null as UpgradePlan | null,
    planLoading: false,
    planError: null as string | null,
  }),

  actions: {
    async fetchReadiness(
      params: { sanId?: string; clusterId?: string; nodeIds?: string[] },
      options?: { force?: boolean },
    ) {
      if (!useAuthStore().isAuthenticated) return

      const now = Date.now()
      if (
        !options?.force
        && this.lastReadinessFetchAt
        && now - this.lastReadinessFetchAt < READINESS_THROTTLE_MS
        && this.readiness
      ) {
        return
      }

      this.readinessLoading = true
      this.readinessError = null
      try {
        const q: Record<string, string | string[]> = {}
        if (params.sanId) q.sanId = params.sanId
        if (params.clusterId) q.clusterId = params.clusterId
        if (params.nodeIds?.length) q.nodeIds = params.nodeIds
        const key = singleFlightKey('/api/admin/upgrade/readiness', q)
        this.readiness = await singleFlight(key, () =>
          $fetch<UpgradeReadinessReport>('/api/admin/upgrade/readiness', { query: q }),
        )
        this.lastReadinessFetchAt = Date.now()
      } catch (err: unknown) {
        if (isUnauthorizedError(err)) return
        const e = err as { data?: { message?: string }; message?: string }
        this.readinessError = e.data?.message ?? e.message ?? 'Erreur'
        this.readiness = null
      } finally {
        this.readinessLoading = false
      }
    },

    async fetchPackageStatus(sanId: string) {
      if (!useAuthStore().isAuthenticated) return
      try {
        const s = await $fetch<UpgradePackageStatus>('/api/admin/upgrade/package/status', {
          query: { sanId },
        })
        this.packageStatus = s?.stagingId ? s : null
      } catch (err) {
        if (isUnauthorizedError(err)) return
        this.packageStatus = null
      }
    },

    async uploadPackage(form: FormData) {
      this.packageLoading = true
      this.packageError = null
      try {
        const result = await $fetch<{
          stagingId: string
          phase: string
          installShPath?: string
        }>('/api/admin/upgrade/package/upload', {
          method: 'POST',
          body: form,
        })
        await this.fetchPackageStatus(form.get('sanId') as string)
        return result
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string }
        this.packageError = e.data?.message ?? e.message ?? 'Erreur upload'
        throw err
      } finally {
        this.packageLoading = false
      }
    },

    async removePackage(sanId: string) {
      await $fetch('/api/admin/upgrade/package', { method: 'DELETE', query: { sanId } })
      this.packageStatus = null
    },

    async generatePlan(body: {
      sanId?: string
      clusterId?: string
      nodeIds?: string[]
      targetVersion?: string
      packageStagingId?: string
    }) {
      this.planLoading = true
      this.planError = null
      try {
        this.plan = await $fetch<UpgradePlan>('/api/admin/upgrade/plan', { method: 'POST', body })
      } catch (err: unknown) {
        const e = err as { data?: { message?: string }; message?: string }
        this.planError = e.data?.message ?? e.message ?? 'Erreur'
        throw err
      } finally {
        this.planLoading = false
      }
    },
  },
})
