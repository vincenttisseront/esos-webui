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
    async fetch(nodeIds?: string[]) {
      if (nodeIds?.length) {
        this.activeNodeIds = nodeIds
      }

      const ids = this.activeNodeIds
      if (!ids?.length) {
        this.error = 'Impossible de charger le statut cluster sans identifiants de nœuds (nodeIds).'
        return
      }

      this.loading = true
      try {
        const query = { nodeIds: ids.join(',') }
        this.overview = await $fetch<ClusterOverview>('/api/cluster/status', { query })
        this.error    = null
      } catch (err: any) {
        this.error = err?.data?.message ?? 'Erreur lors du chargement du statut cluster'
      } finally {
        this.loading = false
      }
    },

    /** @param explicitNodeIds Si fourni, utilisé pour la sync ; sinon `activeNodeIds` du store. */
    async sync(explicitNodeIds?: string[]) {
      const nodeIds = explicitNodeIds?.length ? explicitNodeIds : this.activeNodeIds ?? []
      if (!nodeIds.length) {
        useAppToast().error(
          'Synchronisation impossible',
          'Aucun nœud cible connu. Chargez d’abord le statut du cluster ou sélectionnez un groupe de nœuds.',
        )
        return
      }

      this.syncing = true
      try {
        const result = await $fetch<{ output: string }>('/api/cluster/sync', {
          method: 'POST',
          body:   { nodeIds },
        })
        useAppToast().success('Synchronisation réussie', result.output.slice(0, 120))
        await this.fetch(nodeIds)
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
      this.stopPolling()
      if (!this.activeNodeIds?.length) {
        this.error = 'Polling cluster impossible sans nodeIds. Appelez fetch(nodeIds) d’abord.'
        return
      }
      this.fetch()
      this.pollInterval = setInterval(() => this.fetch(), intervalMs)
    },

    stopPolling() {
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
        this.pollInterval = null
      }
    },
  },
})
