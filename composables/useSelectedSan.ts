import type {
  ClusterSelectionDto,
  SanSelectionDto,
  SelectionContextResponse,
  SSHLiveStatus,
} from '~/server/utils/selection-context'
import { singleFlight } from '~/utils/single-flight'

export type { SSHLiveStatus } from '~/server/utils/selection-context'

/** Sentinel value meaning "all SANs aggregated". */
export const ALL_SANS_ID = '__all__'

/** A "context" is either a standalone SAN or a cluster. */
export type SelectedContext =
  | { type: 'san'; san: SanSelectionDto }
  | { type: 'cluster'; cluster: ClusterSelectionDto }

/**
 * Global composable for multi-SAN / cluster selection.
 * - Single SAN (no cluster): works exactly as before.
 * - Multi SAN or clusters: user can pick a SAN, a cluster, or ALL_SANS_ID.
 *
 * `effective` always resolves to a concrete SAN for data fetching:
 *   - standalone SAN → itself
 *   - cluster        → the node with clusterRole === 'primary' (first node fallback)
 */
export function useSelectedSan() {
  const sans        = useState<SanSelectionDto[]>('selectedSan:list', () => [])
  const clusters    = useState<ClusterSelectionDto[]>('selectedSan:clusters', () => [])
  const selectedId  = useState<string | null>('selectedSan:id', () => null)
  const loading     = useState<boolean>('selectedSan:loading', () => false)
  const sshStatuses = useState<Record<string, SSHLiveStatus>>('selectedSan:sshStatuses', () => ({}))

  const activeSans     = computed(() => sans.value.filter(s => s.status === 'active'))
  // SANs that don't belong to any cluster
  const standaloneSans = computed(() => activeSans.value.filter(s => !s.clusterId))

  const isMultiSan  = computed(() => activeSans.value.length > 1 || clusters.value.length > 0)
  const isAll       = computed(() => isMultiSan.value && selectedId.value === ALL_SANS_ID)

  /** Currently selected cluster (if selectedId matches a cluster id) */
  const selectedCluster = computed<ClusterSelectionDto | null>(() => {
    if (!selectedId.value) return null
    return clusters.value.find(c => c.id === selectedId.value) ?? null
  })

  const selected = computed<SanSelectionDto | null>(() => {
    if (isAll.value)           return null
    if (selectedCluster.value) return null
    if (!selectedId.value)     return activeSans.value[0] ?? null
    return activeSans.value.find(s => s.id === selectedId.value) ?? activeSans.value[0] ?? null
  })

  /**
   * Effective SAN for API calls (hardware, overview, stats).
   * Cluster → primary node SAN; standalone → itself.
   */
  const effective = computed<SanSelectionDto | null>(() => {
    if (selectedCluster.value) {
      const primary = selectedCluster.value.nodes.find(n => n.clusterRole === 'primary')
                   ?? selectedCluster.value.nodes[0]
      if (!primary) return activeSans.value[0] ?? null
      return activeSans.value.find(s => s.id === primary.id) ?? activeSans.value[0] ?? null
    }
    return activeSans.value.find(s => s.id === selected.value?.id) ?? activeSans.value[0] ?? null
  })

  /** Context object for the current selection — used by header / dashboard */
  const context = computed<SelectedContext | null>(() => {
    if (selectedCluster.value) return { type: 'cluster', cluster: selectedCluster.value }
    const san = selected.value
    if (san) return { type: 'san', san }
    return null
  })

  const isEffectiveReadOnly = computed(() => effective.value?.readOnly ?? false)

  async function fetchSans($f: typeof $fetch = $fetch) {
    if (loading.value) return
    loading.value = true
    try {
      const body = await singleFlight('context-selection', () =>
        $f<SelectionContextResponse>('/api/context/selection'),
      )
      sans.value        = body.sans
      sshStatuses.value = body.sshStatuses
      clusters.value    = body.clusters
      const activeData = body.sans.filter(s => s.status === 'active')
      if (
        selectedId.value
        && selectedId.value !== ALL_SANS_ID
        && !activeData.find(s => s.id === selectedId.value)
        && !body.clusters.find(c => c.id === selectedId.value)
      ) {
        selectedId.value = null
      }
    } finally {
      loading.value = false
    }
  }

  function select(id: string) {
    selectedId.value = id
  }

  function selectAll() {
    selectedId.value = ALL_SANS_ID
  }

  return {
    sans, activeSans, standaloneSans, clusters,
    selected, selectedCluster, effective, context,
    selectedId, isMultiSan, isAll, loading, isEffectiveReadOnly,
    sshStatuses, fetchSans, select, selectAll,
  }
}
