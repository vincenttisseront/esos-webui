import type { ClusterWithNodes } from '~/server/api/admin/clusters/index.get'
import type { AdvancedStorageClusterOverview } from '~/types/advanced-storage'
import { clusterStorageQuery, isClusterStorageScope } from '~/utils/cluster-storage-navigation'

type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export function useAdvancedStorageClusterScope(pageSanId: Ref<string> | ComputedRef<string>) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useEsosI18n()

  const sanId = computed(() => toValue(pageSanId))

  const clusterScopeFromRoute = computed(() => isClusterStorageScope(route.query as Record<string, unknown>))

  const clusterScopeId = computed(() => clusterScopeFromRoute.value?.clusterId ?? null)

  const { data: clustersRegistry } = useFetch<ClusterWithNodes[]>(
    '/api/admin/clusters',
    { default: () => [] },
  )

  const liveStatuses = ref<Record<string, SSHStatus>>({})

  async function refreshLiveStatuses() {
    if (!clusterScopeId.value) return
    try {
      liveStatuses.value = await $fetch<Record<string, SSHStatus>>('/api/admin/sans/statuses')
    } catch {
      liveStatuses.value = {}
    }
  }

  watch(clusterScopeId, (id) => {
    if (id) void refreshLiveStatuses()
  }, { immediate: true })

  const clusterName = computed(() => {
    const id = clusterScopeId.value
    if (!id) return ''
    return clustersRegistry.value?.find(c => c.id === id)?.name ?? id
  })

  const clusterNodes = computed(() => {
    const id = clusterScopeId.value
    if (!id) return []
    return clustersRegistry.value?.find(c => c.id === id)?.nodes ?? []
  })

  const isClusterMember = computed(() => {
    if (!clusterScopeId.value) return true
    return clusterNodes.value.some(n => n.id === sanId.value)
  })

  function buildClusterRouteQuery(): Record<string, string> {
    if (!clusterScopeId.value) return {}
    return clusterStorageQuery(clusterScopeId.value)
  }

  function navigateToClusterNode(targetSanId: string) {
    if (!clusterScopeId.value || targetSanId === sanId.value) return
    void router.push({
      path: `/admin/sans/${targetSanId}/advanced-storage`,
      query: buildClusterRouteQuery(),
    })
  }

  const clusterOverview = ref<AdvancedStorageClusterOverview | null>(null)
  const clusterOverviewLoading = ref(false)

  async function fetchClusterOverview(force = false) {
    if (!clusterScopeId.value) {
      clusterOverview.value = null
      return
    }
    clusterOverviewLoading.value = true
    try {
      clusterOverview.value = await $fetch<AdvancedStorageClusterOverview>(
        '/api/advanced-storage/cluster-overview',
        {
          query: {
            clusterId: clusterScopeId.value,
            ...(force ? { refresh: '1' } : {}),
          },
        },
      )
    } catch {
      clusterOverview.value = null
    } finally {
      clusterOverviewLoading.value = false
    }
  }

  watch(clusterScopeId, (id) => {
    if (id) void fetchClusterOverview()
    else clusterOverview.value = null
  }, { immediate: true })

  function clusterRoleLabel(role: string | null): string {
    if (role === 'primary') return t('admin.sans.cluster_card.primary') as string
    if (role === 'secondary') return t('admin.sans.cluster_card.secondary') as string
    return role ?? '—'
  }

  return {
    clusterScopeId,
    clusterName,
    clusterNodes,
    isClusterMember,
    buildClusterRouteQuery,
    navigateToClusterNode,
    clusterOverview,
    clusterOverviewLoading,
    fetchClusterOverview,
    clusterRoleLabel,
    liveStatuses,
  }
}
