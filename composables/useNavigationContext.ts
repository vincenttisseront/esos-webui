import {
  computeShowClusterHaNav,
  computeShowMultiSelector,
  computeShowTopContextSelector,
  getNavigationContextKind,
  resolveContextSwitchTarget,
  resolveInvalidClusterRouteRedirect,
  syncSelectedIdFromRoute,
  type NavigationContextInput,
  type NavigationContextKind,
  type NavSwitchTarget,
} from '~/utils/navigation-context'

function inputFromSelector(sanSelector: ReturnType<typeof useSelectedSan>): NavigationContextInput {
  return {
    selectedId: sanSelector.selectedId.value,
    selected: sanSelector.selected.value,
    selectedCluster: sanSelector.selectedCluster.value,
    isAll: sanSelector.isAll.value,
    clusters: sanSelector.clusters.value,
    activeSans: sanSelector.activeSans.value,
  }
}

export function useNavigationContext() {
  const route = useRoute()
  const sanSelector = useSelectedSan()

  const input = computed(() => inputFromSelector(sanSelector))

  const contextKind = computed((): NavigationContextKind =>
    getNavigationContextKind(input.value),
  )

  const showClusterHaNav = computed(() => computeShowClusterHaNav(input.value))
  const showTopContextSelector = computed(() => computeShowTopContextSelector(input.value))
  const showMultiSelector = computed(() => computeShowMultiSelector(input.value))

  function targetForSwitch(nextId: string): NavSwitchTarget {
    return resolveContextSwitchTarget(nextId, route, input.value)
  }

  function invalidClusterRedirect(): NavSwitchTarget {
    return resolveInvalidClusterRouteRedirect(route, input.value)
  }

  function applyRouteToSelection(): void {
    const id = syncSelectedIdFromRoute(route, input.value)
    if (id) sanSelector.select(id)
  }

  return {
    input,
    contextKind,
    showClusterHaNav,
    showTopContextSelector,
    showMultiSelector,
    targetForSwitch,
    invalidClusterRedirect,
    applyRouteToSelection,
  }
}
