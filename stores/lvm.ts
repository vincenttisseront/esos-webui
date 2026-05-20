import { defineStore } from 'pinia'
import { overviewHasLv } from '~/utils/lvm-lv-size'
import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionPlan,
  ClusterLvmNodeInventory,
  ClusterLvmPreflightResult,
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
  ClusterLvmExecutionRequest,
  ClusterLvmExecutionResult,
} from '~/types/lvm'

export const useLvmStore = defineStore('lvm', {
  state: () => ({
    overview: null as LvmOverviewResponse | null,
    loading: false,
    error: null as string | null,
    sanId: null as string | null,
    clusterId: null as string | null,
    lastClusterPlan: null as ClusterLvmExecutionPlan | null,
    lastDiskMappings: [] as ClusterLvmDiskMapping[],
    clusterInventory: null as ClusterLvmNodeInventory[] | null,
    clusterInventoryLoading: false,
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

    setClusterContext(clusterId: string, primarySanId: string) {
      this.clusterId = clusterId
      this.sanId = primarySanId
    },

    async fetchOverview(refresh = false) {
      if (!this.sanId) return
      this.loading = true
      this.error = null
      try {
        this.overview = await $fetch<LvmOverviewResponse>('/api/lvm/overview', {
          query: { ...this.query(), ...(refresh ? { refresh: '1' } : {}) },
        })
        if (this.clusterId) {
          await this.fetchClusterInventory(this.clusterId)
        }
      } catch (err: any) {
        this.error = err?.data?.message ?? err?.statusMessage ?? err?.message ?? 'Erreur scan LVM'
      } finally {
        this.loading = false
      }
    },

    async fetchClusterInventory(clusterId: string) {
      this.clusterInventoryLoading = true
      try {
        const res = await $fetch<{ nodes: ClusterLvmNodeInventory[] }>('/api/lvm/cluster/inventory', {
          query: { clusterId },
        })
        this.clusterInventory = res.nodes
        const primary = res.nodes.find(n => n.sanId === this.sanId)
        if (primary?.overview.candidates.length) {
          const mappings: ClusterLvmDiskMapping[] = []
          for (const c of primary.overview.candidates.filter(x => x.eligible && x.kind === 'md')) {
            for (const peer of res.nodes.filter(p => p.sanId !== this.sanId)) {
              const peerCand = peer.overview.candidates.find(x => x.path === c.path && x.eligible)
              if (peerCand) {
                mappings.push({
                  sourceSanId: this.sanId!,
                  peerSanId: peer.sanId,
                  sourcePath: c.path,
                  peerPath: c.path,
                  stableKey: c.path,
                })
              }
            }
          }
          this.lastDiskMappings = mappings
        }
        return res.nodes
      } finally {
        this.clusterInventoryLoading = false
      }
    },

    async clusterPreflight(req: LvmPreflightRequest & { clusterId: string; primarySanId: string }): Promise<ClusterLvmPreflightResult> {
      const result = await $fetch<ClusterLvmPreflightResult>('/api/lvm/cluster/preflight', {
        method: 'POST',
        body: req,
      })
      if (result.mappings?.length) this.lastDiskMappings = result.mappings
      return result
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

    async bindScstCluster(
      payload: BindScstPayload & { clusterId: string; primarySanId: string },
    ) {
      const result = await $fetch<{ refreshedSanIds?: string[] }>('/api/lvm/lv/bind-scst/cluster', {
        method: 'POST',
        query: this.query(),
        body: payload,
      })
      await this.fetchOverview(true)
      if (payload.clusterId) await this.fetchClusterInventory(payload.clusterId)
      return result
    },

    clusterExecBody<T extends Record<string, unknown>>(payload: T, clusterExecution: ClusterLvmExecutionRequest) {
      return { ...payload, clusterExecution: { ...clusterExecution, clusterId: clusterExecution.clusterId ?? this.clusterId ?? undefined } }
    },

    async planClusterPvCreate(
      payload: PvCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/pv/create/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterPvCreate(
      payload: PvCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/pv/create/cluster', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },

    async planClusterVgCreate(
      payload: VgCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/vg/create/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterVgCreate(
      payload: VgCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/vg/create/cluster', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },

    async planClusterLvCreate(
      payload: LvCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/lv/create/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterLvCreate(
      payload: LvCreatePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/lv/create/cluster', { method: 'POST', query: this.query(), body: payload })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },

    lvExistsAfterRefresh(vgName: string, lvName: string): boolean {
      if (overviewHasLv(this.lvs, vgName, lvName)) return true
      const primary = this.clusterInventory?.find(n => n.sanId === this.sanId)
      if (primary && overviewHasLv(primary.overview.lvs, vgName, lvName)) return true
      return (this.clusterInventory ?? []).some(n =>
        overviewHasLv(n.overview.lvs, vgName, lvName),
      )
    },

    async planPvCreate(payload: PvCreatePayload & { clusterExecution: { primarySanId: string; clusterId?: string; diskMappings?: unknown[] } }): Promise<ClusterLvmExecutionPlan> {
      return this.planClusterPvCreate(payload)
    },

    async planClusterPvRemove(
      payload: PvRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/pv/remove/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterPvRemove(
      payload: PvRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/pv/remove/cluster', {
        method: 'POST',
        query: this.query(),
        body: payload,
      })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },

    async planClusterVgRemove(
      payload: VgRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/vg/remove/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterVgRemove(
      payload: VgRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/vg/remove/cluster', {
        method: 'POST',
        query: this.query(),
        body: payload,
      })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },

    async planClusterLvRemove(
      payload: LvRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionPlan> {
      return $fetch('/api/lvm/lv/remove/plan', { method: 'POST', query: this.query(), body: payload })
    },

    async executeClusterLvRemove(
      payload: LvRemovePayload & { clusterExecution: ClusterLvmExecutionRequest },
    ): Promise<ClusterLvmExecutionResult> {
      const result = await $fetch<ClusterLvmExecutionResult>('/api/lvm/lv/remove/cluster', {
        method: 'POST',
        query: this.query(),
        body: payload,
      })
      await this.fetchOverview(true)
      if (this.clusterId) await this.fetchClusterInventory(this.clusterId)
      return result
    },
  },
})
