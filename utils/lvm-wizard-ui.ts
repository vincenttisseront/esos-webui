import type { ClusterLvmNodeInventory, LvmCandidateDevice } from '~/types/lvm'
import { listClusterEligiblePaths } from '~/utils/lvm-cluster-ui'

/** Native &lt;select&gt; styling for LVM modal wizards (avoids USelect popper z-index under AppModalHost). */
export const LVM_NATIVE_SELECT_CLASS =
  'w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed'

export type LvmSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

/** PV create wizard: local node — eligible candidates only (server still validates on submit). */
export function filterLocalPvCreateCandidates(candidates: LvmCandidateDevice[]): LvmCandidateDevice[] {
  return candidates.filter(c => c.eligible)
}

/** PV create wizard: cluster — eligible on all peers. */
export function filterClusterPvCreateCandidates(
  primarySanId: string,
  candidates: LvmCandidateDevice[],
  inventory: ClusterLvmNodeInventory[] | null,
): LvmCandidateDevice[] {
  return listClusterEligiblePaths(primarySanId, candidates, inventory)
}

export function toPvCreateDeviceOptions(candidates: LvmCandidateDevice[]): LvmSelectOption[] {
  return candidates.map(c => ({ value: c.path, label: c.path }))
}

export function pickDefaultPvCreatePath(candidates: LvmCandidateDevice[]): string {
  return candidates[0]?.path ?? ''
}
