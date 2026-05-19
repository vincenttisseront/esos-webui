import { describe, expect, it } from 'vitest'
import { hasActiveMdArrayProgress, overviewHasActiveMdProgress } from '../utils/raid-md-progress'
import type { MdArray, RaidOverviewResponse } from '../types/raid'

function mdArray(partial: Partial<MdArray> & Pick<MdArray, 'name' | 'path'>): MdArray {
  return {
    raidLevel: '1',
    state: 'active',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    members: [],
    usedBy: [],
    warnings: [],
    ...partial,
  }
}

describe('hasActiveMdArrayProgress', () => {
  it('returns true for resync state', () => {
    expect(hasActiveMdArrayProgress(mdArray({ name: 'md0', path: '/dev/md0', state: 'resync' }))).toBe(true)
  })

  it('returns true for recovering state', () => {
    expect(hasActiveMdArrayProgress(mdArray({ name: 'md1', path: '/dev/md1', state: 'recovering' }))).toBe(true)
  })

  it('returns true for reshape progress on active array', () => {
    expect(hasActiveMdArrayProgress(mdArray({
      name: 'md2',
      path: '/dev/md2',
      state: 'active',
      progress: { action: 'reshape', percent: 12.5, speedKbps: 1024, finishEta: '10min' },
    }))).toBe(true)
  })

  it('returns false for idle active array', () => {
    expect(hasActiveMdArrayProgress(mdArray({ name: 'md0', path: '/dev/md0', state: 'active' }))).toBe(false)
  })

  it('returns false when progress is complete at 100% without speed or eta', () => {
    expect(hasActiveMdArrayProgress(mdArray({
      name: 'md0',
      path: '/dev/md0',
      state: 'active',
      progress: { action: 'resync', percent: 100 },
    }))).toBe(false)
  })
})

describe('overviewHasActiveMdProgress', () => {
  it('returns true when any array has progress', () => {
    const overview = {
      mdArrays: [mdArray({ name: 'md0', path: '/dev/md0', state: 'recovering' })],
    } as RaidOverviewResponse
    expect(overviewHasActiveMdProgress(overview)).toBe(true)
  })

  it('returns false for null or empty overview', () => {
    expect(overviewHasActiveMdProgress(null)).toBe(false)
    expect(overviewHasActiveMdProgress({ mdArrays: [] } as RaidOverviewResponse)).toBe(false)
  })
})
