import type { ClusterAttentionPoint } from '~/types/cluster-admin'

export interface ClusterAttentionActionHandlers {
  onSync?: (clusterId: string) => void | Promise<void>
  onAddNode?: (clusterId: string) => void | Promise<void>
  onRemoveNode?: (payload: { nodeId: string; clusterId: string }) => void | Promise<void>
  onReconnect?: (nodeId: string) => void | Promise<void>
}

export function useClusterAttentionAction(handlers: ClusterAttentionActionHandlers = {}) {
  const router = useRouter()

  async function handleAttentionAction(point: ClusterAttentionPoint) {
    const clusterId = typeof point.actionPayload?.clusterId === 'string'
      ? point.actionPayload.clusterId
      : undefined

    switch (point.recommendedAction) {
      case 'sync_config':
        if (clusterId && handlers.onSync) {
          await handlers.onSync(clusterId)
          return
        }
        break
      case 'add_node':
        if (clusterId && handlers.onAddNode) {
          await handlers.onAddNode(clusterId)
          return
        }
        break
      case 'remove_node': {
        const nodeId = point.affectedNodeIds[0]
        if (nodeId && clusterId && handlers.onRemoveNode) {
          await handlers.onRemoveNode({ nodeId, clusterId })
          return
        }
        break
      }
      case 'reconnect': {
        const nodeId = point.affectedNodeIds[0]
        if (nodeId && handlers.onReconnect) {
          await handlers.onReconnect(nodeId)
          return
        }
        break
      }
      default:
        break
    }

    if (point.actionRoute) {
      void router.push(point.actionRoute)
      return
    }

    switch (point.recommendedAction) {
      case 'open_cluster_ha':
        void router.push(clusterId ? `/cluster?clusterId=${clusterId}` : '/cluster')
        break
      case 'set_primary':
        void router.push(clusterId ? `/admin/cluster?clusterId=${clusterId}` : '/admin/cluster')
        break
      default:
        break
    }
  }

  return { handleAttentionAction }
}
