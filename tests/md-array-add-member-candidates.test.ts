import { describe, expect, it } from 'vitest'
import { filterEligibleAddMemberPartitions } from '../utils/md-array-add-member-candidates'
import type { MdArray, RaidBlockDevice } from '../types/raid'

function part(path: string, eligible: boolean): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 1_000_000,
    type: 'part',
    usedBy: [],
    eligibleForMd: eligible,
    eligibleForHardwareRaid: false,
    mdEligibilityReasons: eligible ? [] : ['blocked'],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    warnings: [],
  }
}

const cleanArray: MdArray = {
  name: 'md0',
  path: '/dev/md0',
  raidLevel: '1',
  state: 'clean',
  raidDevices: 2,
  activeDevices: 2,
  workingDevices: 2,
  failedDevices: 0,
  spareDevices: 0,
  members: [
    { path: '/dev/sdb1', state: ['active', 'sync'] },
    { path: '/dev/sdc1', state: ['active', 'sync'] },
  ],
  usedBy: [],
  warnings: [],
}

describe('filterEligibleAddMemberPartitions', () => {
  it('returns eligible partitions excluding active members', () => {
    const devices = [
      part('/dev/sdb1', true),
      part('/dev/sdc1', true),
      part('/dev/sdd1', true),
      part('/dev/sde', false),
    ]
    const result = filterEligibleAddMemberPartitions([cleanArray], devices)
    expect(result.map(d => d.path)).toEqual(['/dev/sdd1'])
  })

  it('excludes non-partition devices', () => {
    const disk: RaidBlockDevice = {
      ...part('/dev/sdd', true),
      type: 'disk',
      path: '/dev/sdd',
    }
    expect(filterEligibleAddMemberPartitions([cleanArray], [disk])).toHaveLength(0)
  })
})
