import type { ClusterLvmNodeInventory, LvmCandidateDevice } from '~/types/lvm'
import { listClusterEligiblePaths } from '~/utils/lvm-cluster-ui'
import { formatLvmCandidateLabel, formatLvmCandidateReason } from '~/utils/lvm-candidate-display'

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

export function toPvCreateDeviceOptions(
  candidates: LvmCandidateDevice[],
  t?: (key: string, params?: Record<string, string | number>) => string,
): LvmSelectOption[] {
  const labelFor = (c: LvmCandidateDevice) => (t ? formatLvmCandidateLabel(c, t) : c.path)
  const reasonFor = (c: LvmCandidateDevice) => {
    if (c.eligible || !c.reasons.length || !t) return undefined
    return c.reasons.map(r => formatLvmCandidateReason(r, t)).join(' · ')
  }
  return candidates.map(c => ({
    value: c.path.startsWith('hw:') ? '' : c.path,
    label: labelFor(c),
    disabled: !c.eligible || c.path.startsWith('hw:'),
    title: reasonFor(c),
  })).filter(o => o.value)
}

export function pickDefaultPvCreatePath(candidates: LvmCandidateDevice[]): string {
  return candidates[0]?.path ?? ''
}

type ApiErrorLike = {
  statusCode?: number
  status?: number
  data?: { statusCode?: number; code?: string; message?: string }
  message?: string
} | null | undefined

/** Resolve cluster preflight HTTP failures for LVM wizards (403 → dedicated i18n). */
export function resolveLvmClusterPreflightError(
  err: ApiErrorLike,
  t: (key: string) => string,
  tError: (err: ApiErrorLike, fallback?: string) => string,
): string {
  const status = err?.statusCode ?? err?.status ?? err?.data?.statusCode
  if (status === 403) {
    return t('lvm.cluster.preflight_forbidden')
  }
  return tError(err, t('lvm.cluster.preflight_failed'))
}
