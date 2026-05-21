import { defineStore } from 'pinia'
import type { ClusterOverview } from '~/server/utils/types'

export const useClusterStore = defineStore('cluster', {
  state: () => ({
    overview:       null as ClusterOverview | null,
    loading:        false,
    syncing:        false,
    error:          null as string | null,
    pollInterval:   null as ReturnType<typeof setInterval> | null,
    activeNodeIds:  null as string[] | null,
    activeClusterId: null as string | null,
  }),

  getters: {
    isConfigured:  (s) => s.overview?.mode !== 'unconfigured',
    isHealthy:     (s) => s.overview?.healthy ?? false,
    nodeCount:     (s) => s.overview?.nodes.length ?? 0,
    primaryNode:   (s) => s.overview?.nodes.find(n => n.role === 'primary'),
    secondaryNode: (s) => s.overview?.nodes.find(n => n.role === 'secondary'),
    clusterMode:   (s) => s.overview?.mode ?? 'unconfigured',
    clusterName:   (s) => s.overview?.clusterName ?? null,
    clusterId:     (s) => s.overview?.clusterId   ?? null,
    isDegraded:    (s) => s.overview?.mode === 'degraded',
    // Nœuds actifs connus dans l'overview (pour le wizard)
    clusterNodes:  (s) => s.overview?.nodes.map(n => ({
      id:    n.nodeId,
      label: n.hostname ?? n.nodeId,
      host:  n.host,
    })) ?? [],
  },

  actions: {
    async fetch(nodeIds?: string[], clusterId?: string) {
      if (clusterId) {
        this.activeClusterId = clusterId
        this.activeNodeIds = nodeIds?.length ? nodeIds : null
      } else if (nodeIds?.length) {
        this.activeNodeIds = nodeIds
        this.activeClusterId = null
      }

      this.loading = true
      try {
        const query = this.activeClusterId
          ? { clusterId: this.activeClusterId }
          : this.activeNodeIds?.length
            ? { nodeIds: this.activeNodeIds.join(',') }
            : null
        if (!query) {
          this.error = 'Impossible de charger le statut cluster (clusterId ou nodeIds requis).'
          return
        }
        this.overview = await $fetch<ClusterOverview>('/api/cluster/status', { query })
        if (this.overview.clusterId) this.activeClusterId = this.overview.clusterId
        this.error = null
      } catch (err: any) {
        this.error = err?.data?.message ?? 'Erreur lors du chargement du statut cluster'
      } finally {
        this.loading = false
      }
    },

    async fetchByClusterId(clusterId: string, nodeIds?: string[]) {
      await this.fetch(nodeIds, clusterId)
    },

    /** Sync via clusterId when known, else nodeIds. */
    async sync(explicitNodeIds?: string[], explicitClusterId?: string) {
      const clusterId = explicitClusterId ?? this.activeClusterId ?? this.overview?.clusterId ?? null
      const nodeIds = explicitNodeIds?.length ? explicitNodeIds : this.activeNodeIds ?? []

      if (!clusterId && !nodeIds.length) {
        useAppToast().error(
          'Synchronisation impossible',
          'Aucun cluster ou nœud cible connu.',
        )
        return
      }

      this.syncing = true
      try {
        const body = clusterId ? { clusterId } : { nodeIds }
        const result = await $fetch<{ output: string }>('/api/cluster/sync', {
          method: 'POST',
          body,
        })
        useAppToast().success('Synchronisation réussie', result.output.slice(0, 120))
        await this.fetch(nodeIds.length ? nodeIds : undefined, clusterId ?? undefined)
      } catch (err: any) {
        useAppToast().error('Erreur de synchronisation', err?.data?.message ?? 'Erreur inconnue')
      } finally {
        this.syncing = false
      }
    },

    async toggleService(nodeId: string, service: 'corosync' | 'pacemaker', action: 'start' | 'stop') {
      const confirmed = await modalConfirm({
        title:   `${action === 'start' ? 'Démarrer' : 'Arrêter'} ${service}`,
        message: `Confirmer l'action "${action}" sur le service ${service} du nœud ${nodeId} ?`,
        intent:  action === 'stop' ? 'danger' : 'neutral',
      })
      if (!confirmed) return

      try {
        await $fetch('/api/cluster/service', {
          method: 'POST',
          body:   { nodeId, service, action },
        })
        useAppToast().success(`${service} ${action === 'start' ? 'démarré' : 'arrêté'}`)
        await this.fetch(this.activeNodeIds ?? undefined)
      } catch (err: any) {
        useAppToast().error(`Erreur sur ${service}`, err?.data?.message ?? 'Erreur inconnue')
      }
    },

    startPolling(intervalMs = 15_000) {
      if (!useAuthStore().isAuthenticated) return
      this.stopPolling()
      if (!this.activeClusterId && !this.activeNodeIds?.length) {
        this.error = 'Polling cluster impossible. Appelez fetch() d’abord.'
        return
      }
      this.fetch(this.activeNodeIds ?? undefined, this.activeClusterId ?? undefined)
      this.pollInterval = setInterval(
        () => this.fetch(this.activeNodeIds ?? undefined, this.activeClusterId ?? undefined),
        intervalMs,
      )
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})
