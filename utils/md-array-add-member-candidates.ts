import type { MdArray, RaidBlockDevice } from '~/types/raid'
import { collectActiveMdMemberPaths } from '~/utils/raid-md-detection'

export function filterEligibleAddMemberPartitions(
  mdArrays: MdArray[],
  blockDevices: RaidBlockDevice[],
): RaidBlockDevice[] {
  const activeMembers = collectActiveMdMemberPaths(mdArrays)
  return blockDevices.filter(dev =>
    dev.type === 'part'
    && dev.eligibleForMd
    && !activeMembers.has(dev.path),
  )
}
