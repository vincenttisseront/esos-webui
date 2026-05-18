/**
 * Store Pinia — RAID Management (SDD v3.12 §14).
 */
import { defineStore } from 'pinia'
import type {
  RaidOverviewResponse, RaidPreflightResult, RaidPreflightRequest,
  RaidOperation, RaidHealth, CreateMdArrayRequest, CreateMdArrayExecutionPlan, CreateMdArrayResponse, CreateHardwareLogicalDriveRequest,
  PrepareMdPartitionsRequest, PrepareMdPartitionsResponse,
  AssembleMdArrayRequest, AssembleMdArrayResponse,
  ZeroMdSuperblocksRequest, ZeroMdSuperblocksResponse,
  WipeMdSignaturesRequest, WipeMdSignaturesResponse,
  ClusterStoragePreflightRequest, ClusterStoragePreflightResult, RaidClusterPreparedMappingHint,
  PartitionMetadataDiagnostics, ZeroMdSuperblockPartitionResult,
} from '~/types/raid'
import {
  loadPendingAdvancedCleanup,
  normalizePartitionPath,
  savePendingAdvancedCleanup,
} from '~/utils/stopped-md'

export const useRaidStore = defineStore('raid', {
  state: () => ({
    overview: null as RaidOverviewResponse | null,
    selectedTab: 'overview' as 'overview' | 'hardware' | 'software' | 'devices' | 'operations',
    operations: [] as RaidOperation[],
    loading: false,
    error: null as string | null,
    pollTimer: null as ReturnType<typeof setInterval> | null,
    sanId: null as string | null,
    preparedClusterMappingHints: {} as Record<string, RaidClusterPreparedMappingHint>,
    pendingAdvancedCleanup: {} as Record<string, PartitionMetadataDiagnostics>,
    lastCleanupResultsByPartition: {} as Record<string, ZeroMdSuperblockPartitionResult>,
  }),

  getters: {
    controllers: (s) => s.overview?.hardwareControllers ?? [],
    mdArrays: (s) => s.overview?.mdArrays ?? [],
    stoppedMdArrays: (s) => s.overview?.stoppedMdArrays ?? [],
    blockDevices: (s) => s.overview?.blockDevices ?? [],
    tools: (s) => s.overview?.tools,
    criticalAlerts: (s) => (s.overview?.alerts ?? []).filter(a => a.severity === 'critical'),
    allAlerts: (s) => s.overview?.alerts ?? [],

    globalHealth: (s): RaidHealth => {
      const alerts = s.overview?.alerts ?? []
      if (alerts.some(a => a.severity === 'critical')) return 'critical'
      if (alerts.some(a => a.severity === 'warning')) return 'warning'
      const arrays = s.overview?.mdArrays ?? []
      if (arrays.some(a => a.state === 'recovering' || a.state === 'resync')) return 'rebuilding'
      const ctrls = s.overview?.hardwareControllers ?? []
      if (ctrls.some(c => c.health === 'warning')) return 'warning'
      return 'ok'
    },

    hasRaid: (s): boolean => {
      return (s.overview?.mdArrays?.length ?? 0) > 0
        || (s.overview?.hardwareControllers?.length ?? 0) > 0
    },

    runningOperations: (s) => s.operations.filter(o => o.status === 'running'),
  },

  actions: {
    query() {
      return this.sanId ? { sanId: this.sanId } : {}
    },

    clusterMappingKey(sourceSanId: string, clusterId?: string | null) {
      return `${sourceSanId}::${clusterId ?? 'standalone'}`
    },

    rememberPreparedClusterMappings(hint: RaidClusterPreparedMappingHint) {
      this.preparedClusterMappingHints[this.clusterMappingKey(hint.sourceSanId, hint.clusterId)] = hint
    },

    getPreparedClusterMappings(sourceSanId: string, clusterId?: string | null): RaidClusterPreparedMappingHint | null {
      return this.preparedClusterMappingHints[this.clusterMappingKey(sourceSanId, clusterId)] ?? null
    },

    clearPreparedClusterMappings(sourceSanId: string, clusterId?: string | null) {
      delete this.preparedClusterMappingHints[this.clusterMappingKey(sourceSanId, clusterId)]
    },

    async fetchOverview(refresh = false) {
      this.loading = true
      this.error = null
      try {
        const params = { ...this.query(), ...(refresh ? { refresh: '1' } : {}) }
        this.overview = await $fetch<RaidOverviewResponse>('/api/raid/overview', { params })
      } catch (err: any) {
        this.error = err?.data?.statusMessage ?? err.message ?? 'Erreur scan RAID'
      } finally {
        this.loading = false
      }
    },

    async preflight(payload: RaidPreflightRequest): Promise<RaidPreflightResult> {
      return await $fetch<RaidPreflightResult>('/api/raid/preflight', {
        method: 'POST',
        body: payload,
        params: this.query(),
      })
    },

    async clusterStoragePreflight(payload: ClusterStoragePreflightRequest): Promise<ClusterStoragePreflightResult> {
      return await $fetch<ClusterStoragePreflightResult>('/api/raid/cluster/preflight', {
        method: 'POST',
        body: payload,
      })
    },

    async fetchOperations() {
      try {
        this.operations = await $fetch<RaidOperation[]>('/api/raid/operations', {
          params: this.query(),
        })
      } catch { /* non bloquant */ }
    },

    async createMdArray(req: CreateMdArrayRequest) {
      const result = await $fetch<CreateMdArrayResponse>('/api/raid/software/arrays', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async planCreateMdArray(req: CreateMdArrayRequest): Promise<CreateMdArrayExecutionPlan> {
      return await $fetch<CreateMdArrayExecutionPlan>('/api/raid/software/arrays/plan', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
    },

    async prepareMdPartitions(req: PrepareMdPartitionsRequest) {
      const result = await $fetch<PrepareMdPartitionsResponse>('/api/raid/software/partitions/prepare', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async stopMdArray(name: string, confirmation: string) {
      const result = await $fetch(`/api/raid/software/arrays/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        body: { confirmation },
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async assembleMdArray(req: AssembleMdArrayRequest) {
      const result = await $fetch<AssembleMdArrayResponse>('/api/raid/software/arrays/assemble', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async zeroMdSuperblocks(req: ZeroMdSuperblocksRequest) {
      const mode = req.mode ?? 'basic'
      const members = req.members.map(normalizePartitionPath)
      console.info('[raid-md:cleanup-ui]', { mode, members })
      const result = await $fetch<ZeroMdSuperblocksResponse>('/api/raid/software/arrays/zero-superblocks', {
        method: 'POST',
        body: { ...req, mode, members },
        params: this.query(),
      })
      this.recordCleanupResults(result.results)
      await this.fetchOverview(true)
      return result
    },

    hydratePendingAdvancedCleanup() {
      if (!this.sanId) return
      const stored = loadPendingAdvancedCleanup(this.sanId)
      this.pendingAdvancedCleanup = { ...stored, ...this.pendingAdvancedCleanup }
    },

    persistPendingAdvancedCleanup() {
      if (!this.sanId) return
      savePendingAdvancedCleanup(this.sanId, this.pendingAdvancedCleanup)
    },

    recordCleanupResults(results: ZeroMdSuperblockPartitionResult[]) {
      const next = { ...this.lastCleanupResultsByPartition }
      for (const r of results) {
        next[normalizePartitionPath(r.partition)] = {
          ...r,
          partition: normalizePartitionPath(r.partition),
        }
      }
      this.lastCleanupResultsByPartition = next
    },

    setPendingAdvancedCleanup(results: ZeroMdSuperblockPartitionResult[]) {
      const next = { ...this.pendingAdvancedCleanup }
      for (const r of results) {
        const path = normalizePartitionPath(r.partition)
        if (r.diagnostics?.recommendedAction === 'advanced_wipe_signatures' && r.diagnostics) {
          next[path] = { ...r.diagnostics, partition: path }
        }
      }
      this.pendingAdvancedCleanup = next
      this.persistPendingAdvancedCleanup()
    },

    clearPendingAdvancedCleanup(partitions?: string[]) {
      if (!partitions?.length) {
        this.pendingAdvancedCleanup = {}
      } else {
        const next = { ...this.pendingAdvancedCleanup }
        for (const p of partitions) {
          delete next[normalizePartitionPath(p)]
        }
        this.pendingAdvancedCleanup = next
      }
      this.persistPendingAdvancedCleanup()
    },

    async wipeMdSignatures(req: WipeMdSignaturesRequest) {
      const members = req.members.map(normalizePartitionPath)
      console.info('[raid-md:cleanup-ui]', { mode: 'advanced', members })
      const result = await $fetch<WipeMdSignaturesResponse>('/api/raid/software/arrays/wipe-signatures', {
        method: 'POST',
        body: { ...req, mode: 'advanced' as const, members },
        params: this.query(),
      })
      this.recordCleanupResults(result.results)
      await this.fetchOverview(true)
      this.clearPendingAdvancedCleanup(members)
      return result
    },

    async addMdDevice(name: string, device: string) {
      const result = await $fetch(`/api/raid/software/arrays/${encodeURIComponent(name)}/devices`, {
        method: 'POST',
        body: { device },
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async setMdDeviceFaulty(name: string, device: string) {
      const encoded = encodeURIComponent(device.replace(/\//g, '_'))
      const result = await $fetch(
        `/api/raid/software/arrays/${encodeURIComponent(name)}/devices/${encoded}/faulty`,
        { method: 'POST', params: this.query() },
      )
      await this.fetchOverview(true)
      return result
    },

    async removeMdDevice(name: string, device: string, confirmation: string) {
      const encoded = encodeURIComponent(device.replace(/\//g, '_'))
      const result = await $fetch(
        `/api/raid/software/arrays/${encodeURIComponent(name)}/devices/${encoded}`,
        { method: 'DELETE', body: { confirmation }, params: this.query() },
      )
      await this.fetchOverview(true)
      return result
    },

    async createHardwareLogicalDrive(req: CreateHardwareLogicalDriveRequest) {
      const result = await $fetch('/api/raid/hardware/logical-drives', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async deleteHardwareLogicalDrive(id: string, confirmation: string) {
      const result = await $fetch(`/api/raid/hardware/logical-drives/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: { confirmation },
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    startPolling(intervalMs = 10_000) {
      this.fetchOverview()
      this.fetchOperations()
      this.pollTimer = setInterval(() => {
        this.fetchOverview()
        this.fetchOperations()
      }, intervalMs)
    },

    stopPolling() {
      if (this.pollTimer) clearInterval(this.pollTimer)
      this.pollTimer = null
    },
  },
})
