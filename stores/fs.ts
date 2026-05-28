import { defineStore } from 'pinia'
import type {
  CreateFileioPayload,
  CreateFsPayload,
  CreateVdiskPayload,
  FsBackendCandidate,
  FsOverview,
  FsPreflightResult,
  FsScanError,
} from '~/types/filesystem'
import type { ClusterFsExecutionRequest } from '~/server/utils/fs-cluster-execution'
import { buildFsFileioViewModel } from '~/utils/fs-fileio-view'
import { mergeFsOverview } from '~/utils/fs-overview-merge'
import {
  loadPersistedActiveFileioMount,
  persistActiveFileioMount,
  pickActiveFileioMount,
} from '~/utils/fs-active-filesystem'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'

export const useFsStore = defineStore('fs', {
  state: () => ({
    overview: null as FsOverview | null,
    candidates: [] as FsBackendCandidate[],
    loading: false,
    error: null as string | null,
    lastEndpoint: '/api/fs/overview' as string,
    lastRefresh: null as Date | null,
    partialRefresh: false,
    partialErrors: [] as FsScanError[],
    sanId: null as string | null,
    clusterId: null as string | null,
    /** Session override set after wizard create or user selection. */
    activeFileioMountOverride: null as string | null,
  }),

  getters: {
    mounts: s => s.overview?.mounts ?? [],
    vdiskFiles: s => s.overview?.vdiskFiles ?? [],
    fileioDevices: s => s.overview?.fileioDevices ?? [],
    lunMappings: s => s.overview?.lunMappings ?? [],
    backends: s => s.overview?.backends ?? [],
    diagnostics: s => s.overview?.diagnostics,
    tools: s => s.overview?.tools,
    activeFileioMountPoint(s): string | null {
      const mounts = s.overview?.mounts ?? []
      const preferred = s.activeFileioMountOverride
        ?? (s.sanId ? loadPersistedActiveFileioMount(s.sanId) : null)
      const hit = pickActiveFileioMount(mounts, { preferredMountPoint: preferred })
      return hit?.mountPoint ?? null
    },

    activeFileioMount(s) {
      const mp = (this as { activeFileioMountPoint: string | null }).activeFileioMountPoint
      if (!mp || !s.overview) return undefined
      return s.overview.mounts.find(m => m.mountPoint === mp)
    },

    fileioView(s) {
      return buildFsFileioViewModel(s.overview, {
        activeMountPoint: (this as { activeFileioMountPoint: string | null }).activeFileioMountPoint,
      })
    },

    effectiveNextAction(s) {
      if (!s.overview) return null
      return computeFsNextAction(s.overview, {
        activeMountPoint: (this as { activeFileioMountPoint: string | null }).activeFileioMountPoint,
      })
    },

    hasStaleData: (s): boolean => {
      if (!s.overview) return false
      if (s.error) return true
      if (!s.lastRefresh) return true
      return Date.now() - s.lastRefresh.getTime() > 120_000
    },
  },

  actions: {
    query() {
      return this.sanId ? { sanId: this.sanId } : {}
    },

    setSanId(sanId: string) {
      this.sanId = sanId
      this.activeFileioMountOverride = loadPersistedActiveFileioMount(sanId)
    },

    setActiveFileioMount(mountPoint: string) {
      const mp = mountPoint.trim()
      if (!mp) return
      this.activeFileioMountOverride = mp
      if (this.sanId) persistActiveFileioMount(this.sanId, mp)
    },

    setClusterContext(clusterId: string, primarySanId: string) {
      this.clusterId = clusterId
      this.sanId = primarySanId
    },

    async fetchOverview(refresh = false) {
      this.loading = true
      this.lastEndpoint = '/api/fs/overview'
      const prior = this.overview
      try {
        const data = await $fetch<FsOverview>(this.lastEndpoint, {
          query: { ...this.query(), ...(refresh ? { refresh: '1' } : {}) },
        })
        const merged = mergeFsOverview(prior, data)
        this.overview = merged
        this.candidates = merged.candidates ?? merged.backends ?? []
        this.lastRefresh = new Date()
        this.error = null
        this.partialErrors = data.errors ?? []
        this.partialRefresh = Boolean(data.partial)
      } catch (e: any) {
        this.error = e?.data?.message ?? e?.message ?? 'Erreur filesystem'
        this.partialRefresh = false
        this.partialErrors = []
        // Keep previous overview for stale display
      } finally {
        this.loading = false
      }
    },

    async fetchCandidates(allowRawDisk = false) {
      if (this.overview?.backends?.length) {
        this.candidates = this.overview.backends
        return
      }
      this.candidates = await $fetch<FsBackendCandidate[]>('/api/fs/candidates', {
        query: { ...this.query(), ...(allowRawDisk ? { allowRawDisk: '1' } : {}) },
      })
    },

    async preflight(action: string, payload: Record<string, unknown>) {
      return $fetch<FsPreflightResult>('/api/fs/preflight', {
        method: 'POST',
        query: this.query(),
        body: { action, payload },
      })
    },

    async createFilesystem(payload: CreateFsPayload, clusterExecution?: ClusterFsExecutionRequest) {
      const url = clusterExecution ? '/api/fs/create/cluster' : '/api/fs/create'
      const result = await $fetch<{ success: boolean; mountPoint: string }>(url, {
        method: 'POST',
        query: this.query(),
        body: clusterExecution ? { ...payload, clusterExecution } : payload,
      })
      if (result.mountPoint) this.setActiveFileioMount(result.mountPoint)
      return result
    },

    async createVdisk(payload: CreateVdiskPayload, clusterExecution?: ClusterFsExecutionRequest) {
      const url = clusterExecution ? '/api/fs/vdisk/cluster' : '/api/fs/vdisk'
      return $fetch(url, {
        method: 'POST',
        query: this.query(),
        body: clusterExecution ? { ...payload, clusterExecution } : payload,
      })
    },

    async bindFileio(payload: CreateFileioPayload, clusterExecution?: ClusterFsExecutionRequest) {
      const url = clusterExecution ? '/api/fs/fileio/cluster' : '/api/fs/fileio'
      return $fetch<{ success: boolean; deviceName: string; nextAction?: { route: string; query?: Record<string, string> } }>(url, {
        method: 'POST',
        query: this.query(),
        body: clusterExecution ? { ...payload, clusterExecution } : payload,
      })
    },

    async deleteVdisk(path: string, confirmation: string) {
      return $fetch('/api/fs/vdisk', {
        method: 'DELETE',
        query: this.query(),
        body: { path, confirmation },
      })
    },

    async unmount(mountPoint: string, confirmation: string) {
      return $fetch('/api/fs/unmount', {
        method: 'DELETE',
        query: this.query(),
        body: { mountPoint, confirmation },
      })
    },
  },
})
