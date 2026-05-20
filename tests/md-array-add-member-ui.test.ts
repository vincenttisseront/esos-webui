import { describe, expect, it } from 'vitest'
import {
  arrayNeedsReplacementMember,
  arraySupportsSpareAdd,
  resolveMdAddMemberUi,
} from '../utils/md-array-add-member-ui'
import type { MdArray } from '../types/raid'

function baseArray(overrides: Partial<MdArray> = {}): MdArray {
  return {
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
      { path: '/dev/sdb1', slot: 0, state: ['active', 'sync'] },
      { path: '/dev/sdc1', slot: 1, state: ['active', 'sync'] },
    ],
    usedBy: [],
    warnings: [],
    ...overrides,
  }
}

describe('arrayNeedsReplacementMember', () => {
  it('returns false for clean RAID1 2/2', () => {
    expect(arrayNeedsReplacementMember(baseArray())).toBe(false)
  })

  it('returns true when degraded or missing active count', () => {
    expect(arrayNeedsReplacementMember(baseArray({ state: 'degraded', activeDevices: 1 }))).toBe(true)
    expect(arrayNeedsReplacementMember(baseArray({ activeDevices: 1 }))).toBe(true)
    expect(arrayNeedsReplacementMember(baseArray({ failedDevices: 1 }))).toBe(true)
  })

  it('returns true when a member is faulty or removed', () => {
    expect(
      arrayNeedsReplacementMember(
        baseArray({
          members: [
            { path: '/dev/sdb1', state: ['faulty'] },
            { path: '/dev/sdc1', state: ['active', 'sync'] },
          ],
        }),
      ),
    ).toBe(true)
    expect(
      arrayNeedsReplacementMember(
        baseArray({
          members: [
            { path: undefined, state: ['removed'] },
            { path: '/dev/sdc1', state: ['active', 'sync'] },
          ],
        }),
      ),
    ).toBe(true)
  })
})

describe('arraySupportsSpareAdd', () => {
  it('supports RAID1 and RAID5', () => {
    expect(arraySupportsSpareAdd(baseArray({ raidLevel: '1' }))).toBe(true)
    expect(arraySupportsSpareAdd(baseArray({ raidLevel: '5' }))).toBe(true)
  })

  it('does not support RAID0 or linear', () => {
    expect(arraySupportsSpareAdd(baseArray({ raidLevel: '0' }))).toBe(false)
    expect(arraySupportsSpareAdd(baseArray({ raidLevel: 'linear' }))).toBe(false)
  })
})

describe('resolveMdAddMemberUi', () => {
  it('shows replacement primary when degraded', () => {
    const ui = resolveMdAddMemberUi(baseArray({ state: 'degraded', activeDevices: 1 }))
    expect(ui.primary).toBe('replacement')
    expect(ui.showSpare).toBe(false)
    expect(ui.enabled).toBe(true)
  })

  it('shows spare for healthy RAID1 full array', () => {
    const ui = resolveMdAddMemberUi(baseArray())
    expect(ui.primary).toBe('spare')
    expect(ui.showSpare).toBe(true)
    expect(ui.enabled).toBe(true)
  })

  it('shows none for healthy RAID0 without spare support', () => {
    const ui = resolveMdAddMemberUi(baseArray({ raidLevel: '0' }))
    expect(ui.primary).toBe('none')
    expect(ui.showSpare).toBe(false)
  })
})
