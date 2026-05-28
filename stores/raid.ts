/**
 * Store Pinia — RAID Management (SDD v3.12 §14).
 */
import { defineStore } from 'pinia'
import type {
  RaidOverviewResponse, RaidPreflightResult, RaidPreflightRequest,
  RaidOperation, RaidHealth, CreateMdArrayRequest, CreateMdArrayExecutionPlan, CreateMdArrayResponse,
  CreateHardwareLogicalDriveRequest, CreateHardwareLogicalDriveResponse,
  PrepareMdPartitionsRequest, PrepareMdPartitionsResponse,
  AssembleMdArrayRequest, AssembleMdArrayResponse,
  ZeroMdSuperblocksRequest, ZeroMdSuperblocksResponse,
  WipeMdSignaturesRequest, WipeMdSignaturesResponse,
  ClusterMdExecutionPlan, ClusterMdExecutionRequest, StopMdArrayResponse,
  ClusterStoragePreflightRequest, ClusterStoragePreflightResult, RaidClusterPreparedMappingHint,
  AddMdMemberRequest, AddMdMemberResponse, AddMdMemberExecutionPlan,
  PartitionMetadataDiagnostics, ZeroMdSuperblockPartitionResult,
} from '~/types/raid'
import {
  loadPendingAdvancedCleanup,
  normalizePartitionPath,
  savePendingAdvancedCleanup,
} from '~/utils/stopped-md'
import { overviewHasActiveMdProgress } from '~/utils/raid-md-progress'
import { normalizeEsosSystemProtection } from '~/utils/esos-system-protection'

const MD_PROGRESS_POLL_INTERVAL_MS = 5_000
const MD_PROGRESS_POLL_MAX_FAILURES = 3

export const useRaidStore = defineStore('raid', {
  state: () => ({
    overview: null as RaidOverviewResponse | null,
    selectedTab: 'overview' as 'overview' | 'hardware' | 'software' | 'lvm' | 'devices' | 'operations',
    operations: [] as RaidOperation[],
    loading: false,
    error: null as string | null,
    pollTimer: null as ReturnType<typeof setInterval> | null,
    progressPollTimer: null as ReturnType<typeof setInterval> | null,
    pollInFlight: false,
    polling: false,
    autoRefreshActive: false,
    progressPollFailures: 0,
    progressPollPaused: false,
    progressPollWarning: null as string | null,
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
      return (s.overview?.mdDetection?.hasAnyMdState ?? false)
        || (s.overview?.hardwareControllers?.length ?? 0) > 0
    },

    hasMdDetection: (s): boolean => s.overview?.mdDetection?.hasAnyMdState ?? false,

    mdDetectionItems: (s) => s.overview?.mdDetection?.items ?? [],

    peerMdDetection: (s) => s.overview?.clusterMdDetection ?? [],

    mdSoftwareCount: (s): number => {
      const items = s.overview?.mdDetection?.items ?? []
      const paths = new Set(items.map(i => i.relatedArrayPath ?? i.path))
      return paths.size
    },

    runningOperations: (s) => s.operations.filter(o => s.status === 'running'),

    systemProtection: (s) => normalizeEsosSystemProtection(s.overview?.systemProtection),
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

    async fetchOverview(
      refresh = false,
      options?: { silent?: boolean; reconcilePolling?: boolean },
    ) {
      const silent = options?.silent ?? false
      const reconcilePolling = options?.reconcilePolling ?? true
      if (silent && this.pollInFlight) return false

      if (!silent) {
        this.loading = true
        this.error = null
      } else {
        this.polling = true
      }
      this.pollInFlight = true

      let ok = false
      try {
        const params = { ...this.query(), ...(refresh ? { refresh: '1' } : {}) }
        const data = await $fetch<RaidOverviewResponse>('/api/raid/overview', { params })
        this.overview = {
          ...data,
          systemProtection: normalizeEsosSystemProtection(data.systemProtection),
        }
        if (silent) this.progressPollFailures = 0
        ok = true
      } catch (err: any) {
        if (silent) {
          this.progressPollFailures += 1
          if (this.progressPollFailures >= MD_PROGRESS_POLL_MAX_FAILURES) {
            this.stopProgressPolling()
            this.progressPollWarning = err?.data?.statusMessage ?? err.message ?? 'Erreur scan RAID'
          }
        } else {
          this.error = err?.data?.statusMessage ?? err.message ?? 'Erreur scan RAID'
        }
      } finally {
        this.pollInFlight = false
        if (!silent) this.loading = false
        else this.polling = false
        if (reconcilePolling && ok) this.reconcileProgressPolling()
      }
      return ok
    },

    async refreshOverviewForProgress() {
      return await this.fetchOverview(true, { silent: true })
    },

    reconcileProgressPolling() {
      if (this.progressPollPaused || !this.sanId) {
        this.stopProgressPolling()
        return
      }
      if (overviewHasActiveMdProgress(this.overview)) {
        if (!this.progressPollTimer) {
          this.autoRefreshActive = true
          this.progressPollFailures = 0
          this.progressPollTimer = setInterval(() => {
            void this.refreshOverviewForProgress()
          }, MD_PROGRESS_POLL_INTERVAL_MS)
        }
      } else {
        this.stopProgressPolling()
      }
    },

    stopProgressPolling() {
      if (this.progressPollTimer) clearInterval(this.progressPollTimer)
      this.progressPollTimer = null
      this.autoRefreshActive = false
    },

    pauseProgressPolling() {
      this.progressPollPaused = true
      this.stopProgressPolling()
    },

    resumeProgressPolling() {
      this.progressPollPaused = false
      this.reconcileProgressPolling()
    },

    clearProgressPollWarning() {
      this.progressPollWarning = null
    },

    async initRaidPage() {
      await this.fetchOverview(true, { reconcilePolling: false })
      await this.fetchOperations()
      this.reconcileProgressPolling()
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

    async planStopMdArray(name: string, clusterExecution: ClusterMdExecutionRequest): Promise<ClusterMdExecutionPlan> {
      return await $fetch<ClusterMdExecutionPlan>('/api/raid/software/arrays/stop/plan', {
        method: 'POST',
        body: { name, clusterExecution },
        params: this.query(),
      })
    },

    async planAssembleMdArray(req: AssembleMdArrayRequest): Promise<ClusterMdExecutionPlan> {
      return await $fetch<ClusterMdExecutionPlan>('/api/raid/software/arrays/assemble/plan', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
    },

    async planZeroMdSuperblocks(req: ZeroMdSuperblocksRequest): Promise<ClusterMdExecutionPlan> {
      return await $fetch<ClusterMdExecutionPlan>('/api/raid/software/arrays/zero-superblocks/plan', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
    },

    async planWipeMdSignatures(req: WipeMdSignaturesRequest): Promise<ClusterMdExecutionPlan> {
      return await $fetch<ClusterMdExecutionPlan>('/api/raid/software/arrays/wipe-signatures/plan', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
    },

    async stopMdArray(name: string, confirmation: string, clusterExecution?: ClusterMdExecutionRequest) {
      const result = await $fetch<StopMdArrayResponse>(`/api/raid/software/arrays/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        body: { confirmation, clusterExecution },
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
      return await this.zeroMdSuperblocksOnSan(this.sanId!, req)
    },

    async zeroMdSuperblocksOnSan(targetSanId: string, req: ZeroMdSuperblocksRequest) {
      const mode = req.mode ?? 'basic'
      const members = req.members.map(normalizePartitionPath)
      console.info('[raid-md:cleanup-ui]', { mode, members, targetSanId })
      const result = await $fetch<ZeroMdSuperblocksResponse>('/api/raid/software/arrays/zero-superblocks', {
        method: 'POST',
        body: { ...req, mode, members },
        params: { sanId: targetSanId },
      })
      this.recordCleanupResults(result.results)
      if (targetSanId === this.sanId) {
        await this.fetchOverview(true)
      } else {
        await $fetch<RaidOverviewResponse>('/api/raid/overview', {
          params: { sanId: targetSanId, refresh: '1' },
        })
      }
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
      return await this.wipeMdSignaturesOnSan(this.sanId!, req)
    },

    async wipeMdSignaturesOnSan(targetSanId: string, req: WipeMdSignaturesRequest) {
      const members = req.members.map(normalizePartitionPath)
      console.info('[raid-md:cleanup-ui]', { mode: 'advanced', members, targetSanId })
      const result = await $fetch<WipeMdSignaturesResponse>('/api/raid/software/arrays/wipe-signatures', {
        method: 'POST',
        body: { ...req, mode: 'advanced' as const, members },
        params: { sanId: targetSanId },
      })
      this.recordCleanupResults(result.results)
      if (targetSanId === this.sanId) {
        await this.fetchOverview(true)
      } else {
        await $fetch<RaidOverviewResponse>('/api/raid/overview', {
          params: { sanId: targetSanId, refresh: '1' },
        })
      }
      this.clearPendingAdvancedCleanup(members)
      return result
    },

    async planAddMdMember(name: string, req: Omit<AddMdMemberRequest, 'confirmation'>) {
      return await $fetch<AddMdMemberExecutionPlan>(
        `/api/raid/software/arrays/${encodeURIComponent(name)}/devices/plan`,
        { method: 'POST', body: req, params: this.query() },
      )
    },

    async addMdMember(name: string, req: AddMdMemberRequest) {
      const result = await $fetch<AddMdMemberResponse>(
        `/api/raid/software/arrays/${encodeURIComponent(name)}/devices`,
        { method: 'POST', body: req, params: this.query() },
      )
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
      const result = await $fetch<CreateHardwareLogicalDriveResponse>('/api/raid/hardware/logical-drives', {
        method: 'POST',
        body: req,
        params: this.query(),
      })
      await this.fetchOverview(true)
      return result
    },

    async rescanHardwareScsi(input?: { host?: string; controllerId?: string; vdId?: string }) {
      const result = await $fetch<{
        ok: boolean
        command: string
        host: string | null
        foundNewDevice: boolean
        mappedPath: string | null
        diagnostics: {
          vdId: string | null
          controllerId: string | null
          expectedSizeBytes: number | null
          lsscsiBefore: string
          lsscsiAfter: string
          lsblkBefore: string
          lsblkAfter: string
          dmesgTail: string
        }
      }>('/api/raid/hardware/rescan', {
        method: 'POST',
        params: this.query(),
        body: { host: input?.host, controllerId: input?.controllerId, vdId: input?.vdId },
      })
      await this.fetchOverview(true)
      return result
    },

    async deleteHardwareLogicalDrive(id: string, confirmation: string) {
      const result = await $fetch(`/api/raid/hardware/logical-drives/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        body: { confirmation },
        params: { ...this.query(), confirmation },
        headers: { 'X-Raid-Confirmation': confirmation },
      })
      await this.fetchOverview(true)
      return result
    },

    /** @deprecated Use initRaidPage + progress polling instead */
    startPolling(intervalMs = 10_000) {
      void this.initRaidPage()
    },

    stopPolling() {
      this.stopProgressPolling()
      if (this.pollTimer) clearInterval(this.pollTimer)
      this.pollTimer = null
      this.progressPollPaused = false
      this.progressPollFailures = 0
    },

    teardownRaidPage() {
      this.stopPolling()
      this.sanId = null
      this.clearProgressPollWarning()
    },
  },
})
