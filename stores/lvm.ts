import { defineStore } from 'pinia'
import type {
  LvmOverviewResponse,
  LvmPreflightRequest,
  LvmPreflightResult,
  PvCreatePayload,
  VgCreatePayload,
  LvCreatePayload,
  PvRemovePayload,
  VgRemovePayload,
  LvRemovePayload,
  BindScstPayload,
  ClusterLvmExecutionPlan,
} from '~/types/lvm'

export const useLvmStore = defineStore('lvm', {
  state: () => ({
    overview: null as LvmOverviewResponse | null,
    loading: false,
    error: null as string | null,
    sanId: null as string | null,
  }),

  getters: {
    pvs: s => s.overview?.pvs ?? [],
    vgs: s => s.overview?.vgs ?? [],
    lvs: s => s.overview?.lvs ?? [],
    candidates: s => s.overview?.candidates ?? [],
    tools: s => s.overview?.tools,
    alerts: s => s.overview?.alerts ?? [],
    clusterPeers: s => s.overview?.clusterLvmDetection ?? [],
    orphanPvs: s => s.overview?.pvs.filter(p => !p.vgName) ?? [],
  },

  actions: {
    query() {
      return this.sanId ? { sanId: this.sanId } : {}
    },

    setSanId(sanId: string) {
      this.sanId = sanId
    },

    async fetchOverview(refresh = false) {
      if (!this.sanId) return
      this.loading = true
      this.error = null
      try {
        this.overview = await $fetch<LvmOverviewResponse>('/api/lvm/overview', {
          query: { ...this.query(), ...(refresh ? { refresh: '1' } : {}) },
        })
      } catch (err: any) {
        this.error = err?.data?.message ?? err?.statusMessage ?? err?.message ?? 'Erreur scan LVM'
      } finally {
        this.loading = false
      }
    },

    async preflight(req: LvmPreflightRequest): Promise<LvmPreflightResult> {
      return $fetch('/api/lvm/preflight', {
        method: 'POST',
        query: this.query(),
        body: req,
      })
    },

    async createPv(payload: PvCreatePayload) {
      await $fetch('/api/lvm/pv/create', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async createVg(payload: VgCreatePayload) {
      await $fetch('/api/lvm/vg/create', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async createLv(payload: LvCreatePayload) {
      await $fetch('/api/lvm/lv/create', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async removePv(payload: PvRemovePayload) {
      await $fetch('/api/lvm/pv', { method: 'DELETE', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async removeVg(payload: VgRemovePayload) {
      await $fetch('/api/lvm/vg', { method: 'DELETE', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async removeLv(payload: LvRemovePayload) {
      await $fetch('/api/lvm/lv', { method: 'DELETE', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async bindScst(payload: BindScstPayload) {
      await $fetch('/api/lvm/lv/bind-scst', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
    },

    async planPvCreate(payload: PvCreatePayload & { clusterExecution: { primarySanId: string; clusterId?: string; diskMappings?: unknown[] } }): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/pv/create/plan', { method: 'POST', query: this.query(), body: payload })
    },
  },
})
