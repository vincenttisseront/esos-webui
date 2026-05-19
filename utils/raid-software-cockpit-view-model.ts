import type {
  MdArray,
  RaidGroupedActionableItem,
  RaidOverviewResponse,
  RaidSoftwareCockpitViewModel,
  StoppedMdArray,
} from '~/types/raid'
import {
  buildRaidClusterHealthViewModel,
  groupRaidActionableItems,
  type RaidCockpitTranslate,
} from '~/utils/raid-cluster-health-view-model'

/** Categories shown as recommended-action cards (resync is shown on the array card). */
const COCKPIT_ACTION_CATEGORIES = new Set([
  'metadata_local',
  'metadata_peer',
  'metadata_orphan',
  'array_stopped',
  'array_degraded',
  'array_inactive',
  'cluster_asymmetry',
])

export function filterCockpitRecommendedActions(
  items: RaidGroupedActionableItem[],
): RaidGroupedActionableItem[] {
  return items.filter(g => COCKPIT_ACTION_CATEGORIES.has(g.representative.category))
}

export function buildRaidSoftwareCockpitViewModel(input: {
  overview: RaidOverviewResponse | null
  currentSanId: string
  isClustered: boolean
  stoppedAssemblable: StoppedMdArray[]
  stoppedOrphan: StoppedMdArray[]
  showEmptyMdState: boolean
  t: RaidCockpitTranslate
}): RaidSoftwareCockpitViewModel {
  const {
    overview,
    currentSanId,
    isClustered,
    stoppedAssemblable,
    stoppedOrphan,
    showEmptyMdState,
    t,
  } = input

  const status = buildRaidClusterHealthViewModel({
    overview,
    currentSanId,
    isClustered,
    t,
  })

  const activeArrays: MdArray[] = overview?.mdArrays ?? []
  const grouped = groupRaidActionableItems(status.actionableItems, t)
  const recommendedActions = filterCockpitRecommendedActions(grouped)

  const recoveryAssemblableCount = stoppedAssemblable.length
  const recoveryOrphanCount = stoppedOrphan.length
  const hasRecovery = recoveryAssemblableCount + recoveryOrphanCount > 0

  return {
    status,
    activeArrays,
    recommendedActions,
    hasActiveArrays: activeArrays.length > 0,
    hasRecommendedActions: recommendedActions.length > 0,
    hasRecovery,
    recoveryAssemblableCount,
    recoveryOrphanCount,
    showEmptyMdState,
  }
}
