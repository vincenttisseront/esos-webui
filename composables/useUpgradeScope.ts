export type UpgradeSubTab = 'readiness' | 'package' | 'plan' | 'execute'

export interface UpgradeScopeQuery {
  sanId?: string
  clusterId?: string
  nodeIds?: string[]
}

/**
 * Resolves upgrade scope from header SAN/cluster context and optional page SAN id
 * (system-config route). Prefers cluster scope when the page node belongs to the
 * selected cluster.
 */
export function useUpgradeScope(pageSanId?: Ref<string | undefined> | ComputedRef<string | undefined>) {
  const sanSelector = useSelectedSan()
  const versionStore = useESOSVersionStore()

  const anchorSanId = computed((): string | null => {
    const pageId = pageSanId ? toValue(pageSanId) : undefined
    const ctx = sanSelector.context.value
    if (ctx?.type === 'cluster') {
      if (pageId && ctx.cluster.nodes.some(n => n.id === pageId)) return pageId
      return sanSelector.effective.value?.id ?? ctx.cluster.nodes[0]?.id ?? null
    }
    return pageId ?? sanSelector.effective.value?.id ?? null
  })

  const scopeLabel = computed(() => {
    const ctx = sanSelector.context.value
    if (ctx?.type === 'cluster') return `Cluster: ${ctx.cluster.name}`
    const san = sanSelector.effective.value
    return san ? `SAN: ${san.label}` : '—'
  })

  const readinessQueryParams = computed((): UpgradeScopeQuery | null => {
    const ctx = sanSelector.context.value
    const pageId = pageSanId ? toValue(pageSanId) : undefined
    if (ctx?.type === 'cluster') {
      const inCluster = pageId
        ? ctx.cluster.nodes.some(n => n.id === pageId)
        : true
      if (inCluster) {
        const ids = ctx.cluster.nodes.map(n => n.id)
        if (!ids.length) return null
        return { clusterId: ctx.cluster.id, nodeIds: ids }
      }
    }
    const id = pageId ?? sanSelector.effective.value?.id
    if (!id) return null
    return { sanId: id }
  })

  const upgradeSystemConfigPath = computed(() => {
    const id = anchorSanId.value
    if (!id) return null
    return `/admin/sans/${id}/system-config`
  })

  function upgradeUrl(subTab: UpgradeSubTab = 'readiness'): string | null {
    const base = upgradeSystemConfigPath.value
    if (!base) return null
    return `${base}?tab=upgrade&upgradeTab=${subTab}`
  }

  return {
    anchorSanId,
    scopeLabel,
    readinessQueryParams,
    upgradeSystemConfigPath,
    upgradeUrl,
    versionStore,
    sanSelector,
  }
}

export function isUpgradeSubTab(value: unknown): value is UpgradeSubTab {
  return value === 'readiness' || value === 'package' || value === 'plan' || value === 'execute'
}
