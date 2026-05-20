import { describe, expect, it } from 'vitest'
import { buildLvmCandidatesFromInventory } from '../server/utils/lvm-candidates'
import type { MdArray } from '../server/utils/raid-types'

function mdArray(overrides: Partial<MdArray> = {}): MdArray {
  return {
    name: 'md0',
    path: '/dev/md0',
    state: 'clean',
    raidLevel: '1',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    sizeBytes: 100 * 1024 ** 3,
    usedBy: [],
    warnings: [],
    members: [],
    ...overrides,
  }
}

describe('buildLvmCandidatesFromInventory', () => {
  it('offers clean md0 from mdArrays when absent from blockDevices', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [],
      mdArrays: [mdArray()],
      pvs: [],
      lvPaths: new Set(),
    })
    const md0 = candidates.find(c => c.path === '/dev/md0')
    expect(md0).toBeDefined()
    expect(md0?.kind).toBe('md')
    expect(md0?.eligible).toBe(true)
  })

  it('does not offer md member disk as raw PV candidate', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sda',
        path: '/dev/sda',
        type: 'disk',
        sizeBytes: 100 * 1024 ** 3,
        usedBy: ['md'],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      mdArrays: [mdArray()],
      pvs: [],
      lvPaths: new Set(),
    })
    const disk = candidates.find(c => c.path === '/dev/sda')
    expect(disk?.eligible).toBe(false)
  })

  it('skips md0 already used as PV', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [],
      mdArrays: [mdArray()],
      pvs: [{ path: '/dev/md0', vgName: '', sizeBytes: 1, freeBytes: 1, uuid: 'x', usedBy: [] }],
      lvPaths: new Set(),
    })
    expect(candidates.find(c => c.path === '/dev/md0')).toBeUndefined()
  })
})
