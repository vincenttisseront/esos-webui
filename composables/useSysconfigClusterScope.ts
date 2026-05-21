import type { ClusterWithNodes } from '~/server/api/admin/clusters/index.get'
import type { SanSummary } from '~/server/db/repositories/san.repository'
import { isUpgradeSubTab, type UpgradeSubTab } from '~/composables/useUpgradeScope'

export type SysConfigTabKey =
  | 'network'
  | 'datetime'
  | 'smtp'
  | 'users'
  | 'upgrade'
  | 'system'
  | 'terminal'

export type SysconfigTabScopeKind = 'perNode' | 'clusterFuture' | 'clusterAssistant'

type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface SysconfigClusterNodeView {
  id: string
  label: string
  host: string
  port: number
  clusterRole: string | null
  readOnly: boolean
  sshStatus: SSHStatus | undefined
}

export interface SysconfigClusterScopeView {
  id: string
  name: string
  nodes: SysconfigClusterNodeView[]
}

const TAB_SCOPE_MAP: Record<SysConfigTabKey, SysconfigTabScopeKind> = {
  network: 'perNode',
  terminal: 'perNode',
  system: 'perNode',
  users: 'perNode',
  datetime: 'clusterFuture',
  smtp: 'clusterFuture',
  upgrade: 'clusterAssistant',
}

export function getSysconfigTabScope(tab: SysConfigTabKey): SysconfigTabScopeKind {
  return TAB_SCOPE_MAP[tab]
}

export function useSysconfigClusterScope(
  pageSanId: Ref<string> | ComputedRef<string>,
  options: {
    activeTabKey: Ref<SysConfigTabKey>
    activeUpgradeSubTab: Ref<UpgradeSubTab>
  },
) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useEsosI18n()

  const sanId = computed(() => toValue(pageSanId))

  const clusterScopeId = computed((): string | null => {
    const scope = route.query.scope
    const rawScope = Array.isArray(scope) ? scope[0] : scope
    const id = route.query.clusterId
    const rawId = Array.isArray(id) ? id[0] : id
    if (rawScope === 'cluster' && typeof rawId === 'string' && rawId.trim()) return rawId.trim()
    return null
  })

  const { data: clustersRegistry } = useFetch<ClusterWithNodes[]>(
    '/api/admin/clusters',
    { default: () => [] },
  )

  const { data: allSans } = useFetch<SanSummary[]>(
    '/api/admin/sans',
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

  const clusterScope = computed((): SysconfigClusterScopeView | null => {
    const id = clusterScopeId.value
    if (!id) return null
    const cluster = clustersRegistry.value?.find(c => c.id === id)
    const nodes = (cluster?.nodes ?? []).map((n) => {
      const san = allSans.value?.find(s => s.id === n.id)
      return {
        id: n.id,
        label: n.label,
        host: n.host,
        port: san?.port ?? 22,
        clusterRole: n.clusterRole,
        readOnly: san?.readOnly ?? false,
        sshStatus: liveStatuses.value[n.id],
      }
    })
    return {
      id,
      name: cluster?.name ?? id,
      nodes,
    }
  })

  const isClusterMember = computed(() => {
    if (!clusterScope.value) return true
    return clusterScope.value.nodes.some(n => n.id === sanId.value)
  })

  const selectedNode = computed(() =>
    clusterScope.value?.nodes.find(n => n.id === sanId.value) ?? null,
  )

  function clusterRoleLabel(role: string | null): string {
    if (role === 'primary') return t('admin.sans.cluster_card.primary') as string
    if (role === 'secondary') return t('admin.sans.cluster_card.secondary') as string
    return role ?? '—'
  }

  function buildClusterRouteQuery(): Record<string, string> {
    const query: Record<string, string> = {}
    if (clusterScopeId.value) {
      query.scope = 'cluster'
      query.clusterId = clusterScopeId.value
    }
    if (options.activeTabKey.value === 'upgrade') {
      query.tab = 'upgrade'
      query.upgradeTab = options.activeUpgradeSubTab.value
    } else if (options.activeTabKey.value === 'terminal') {
      query.tab = 'terminal'
    } else if (options.activeTabKey.value !== 'network') {
      query.tab = options.activeTabKey.value
    }
    return query
  }

  function navigateToClusterNode(targetSanId: string) {
    if (!clusterScopeId.value || targetSanId === sanId.value) return
    void router.push({
      path: `/admin/sans/${targetSanId}/system-config`,
      query: buildClusterRouteQuery(),
    })
  }

  function syncRouteQuery() {
    void router.replace({
      path: route.path,
      query: buildClusterRouteQuery(),
    })
  }

  return {
    clusterScopeId,
    clusterScope,
    isClusterMember,
    selectedNode,
    clusterRoleLabel,
    navigateToClusterNode,
    syncRouteQuery,
    buildClusterRouteQuery,
    getSysconfigTabScope,
  }
}
