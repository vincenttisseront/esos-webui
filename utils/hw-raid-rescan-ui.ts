import type { PendingHwRaidBackend } from '~/utils/hw-raid-pending-backend'

export interface HwRaidRescanResultLite {
  mappedPath?: string | null
  foundNewDevice: boolean
}

export type HwRaidRescanUiState =
  | 'idle'
  | 'success_mapped'
  | 'success_no_device'

export function classifyHwRaidRescanState(
  pending: PendingHwRaidBackend[],
  result: HwRaidRescanResultLite | null,
): HwRaidRescanUiState {
  if (!result) return 'idle'
  if (result.foundNewDevice && result.mappedPath) return 'success_mapped'
  if (!pending.length) return 'success_mapped'
  return 'success_no_device'
}
