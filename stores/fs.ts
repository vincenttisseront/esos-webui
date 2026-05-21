import { defineStore } from 'pinia'
import type {
  CreateFileioPayload,
  CreateFsPayload,
  CreateVdiskPayload,
  FsBackendCandidate,
  FsOverview,
  FsPreflightResult,
} from '~/types/filesystem'
import type { ClusterFsExecutionRequest } from '~/server/utils/fs-cluster-execution'

export const useFsStore = defineStore('fs', {
  state: () => ({
    overview: null as FsOverview | null,
    candidates: [] as FsBackendCandidate[],
    loading: false,
    error: null as string | null,
    sanId: null as string | null,
    clusterId: null as string | null,
  }),

  getters: {
    mounts: s => s.overview?.mounts ?? [],
    vdiskFiles: s => s.overview?.vdiskFiles ?? [],
    fileioDevices: s => s.overview?.fileioDevices ?? [],
    lunMappings: s => s.overview?.lunMappings ?? [],
    backends: s => s.overview?.backends ?? [],
    diagnostics: s => s.overview?.diagnostics,
    tools: s => s.overview?.tools,
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
      this.loading = true
      this.error = null
      try {
        this.overview = await $fetch<FsOverview>('/api/fs/overview', {
          query: { ...this.query(), ...(refresh ? { refresh: '1' } : {}) },
        })
        this.candidates = this.overview?.candidates ?? this.overview?.backends ?? []
      } catch (e: any) {
        this.error = e?.data?.message ?? e?.message ?? 'Erreur filesystem'
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
      return $fetch(url, {
        method: 'POST',
        query: this.query(),
        body: clusterExecution ? { ...payload, clusterExecution } : payload,
      })
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
