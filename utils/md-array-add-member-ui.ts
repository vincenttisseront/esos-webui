import type { MdArray } from '~/types/raid'

export type MdAddMemberAction = 'none' | 'replacement' | 'spare'

export interface MdAddMemberUiState {
  primary: MdAddMemberAction
  showSpare: boolean
  enabled: boolean
}

const SPARE_SUPPORTED_LEVELS = new Set<MdArray['raidLevel']>(['1', '4', '5', '6', '10'])

export function arrayNeedsReplacementMember(arr: MdArray): boolean {
  if (arr.state === 'degraded' || arr.state === 'failed') return true
  if (arr.failedDevices > 0) return true
  if (arr.activeDevices < arr.raidDevices) return true
  return arr.members.some(
    m =>
      !m.path
      || m.state.includes('faulty')
      || m.state.includes('removed'),
  )
}

export function arraySupportsSpareAdd(arr: MdArray): boolean {
  return SPARE_SUPPORTED_LEVELS.has(arr.raidLevel)
}

export function isHealthyFullArray(arr: MdArray): boolean {
  if (arrayNeedsReplacementMember(arr)) return false
  const healthyState = arr.state === 'clean' || arr.state === 'active'
  if (!healthyState) return false
  return arr.activeDevices >= arr.raidDevices
}

export function resolveMdAddMemberUi(arr: MdArray): MdAddMemberUiState {
  if (arrayNeedsReplacementMember(arr)) {
    return { primary: 'replacement', showSpare: false, enabled: true }
  }
  const showSpare = isHealthyFullArray(arr) && arraySupportsSpareAdd(arr)
  return {
    primary: showSpare ? 'spare' : 'none',
    showSpare,
    enabled: showSpare,
  }
}
