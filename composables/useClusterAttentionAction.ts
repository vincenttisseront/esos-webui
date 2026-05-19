import type { ClusterAttentionPoint } from '~/types/cluster-admin'

export function useClusterAttentionAction() {
  const router = useRouter()

  function handleAttentionAction(point: ClusterAttentionPoint) {
    if (point.actionRoute) {
      void router.push(point.actionRoute)
      return
    }
    switch (point.recommendedAction) {
      case 'open_cluster_ha':
        void router.push('/cluster')
        break
      case 'sync_config':
        break
      default:
        break
    }
  }

  return { handleAttentionAction }
}
