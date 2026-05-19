import { describe, expect, it } from 'vitest'
import {
  isAssemblableStoppedArray,
  isOrphanStoppedArray,
  partitionStoppedMdArrays,
  primaryRecommendedActionForStoppedArray,
} from '../utils/stopped-md'
import type { StoppedMdArray } from '../types/raid'

function stopped(partial: Partial<StoppedMdArray> & Pick<StoppedMdArray, 'name'>): StoppedMdArray {
  return {
    path: partial.path,
    name: partial.name,
    raidLevel: '1',
    raidDevices: 2,
    stoppedState: 'stopped',
    detectedOn: 'examine',
    members: [],
    warnings: [],
    ...partial,
  }
}

describe('partitionStoppedMdArrays', () => {
  it('splits assemblable from orphan metadata', () => {
    const arrays = [
      stopped({ name: 'md0', stoppedState: 'assemblable', members: [{ path: '/dev/sda1', present: true, memberStatus: 'md_superblock_detected' }] }),
      stopped({ name: 'unknown', stoppedState: 'incomplete', members: [{ path: '/dev/sdb1', present: true, memberStatus: 'orphan_metadata' }] }),
    ]
    const { assemblable, orphanOrIncomplete } = partitionStoppedMdArrays(arrays)
    expect(assemblable).toHaveLength(1)
    expect(assemblable[0].name).toBe('md0')
    expect(orphanOrIncomplete).toHaveLength(1)
    expect(orphanOrIncomplete[0].name).toBe('unknown')
  })
})

describe('primaryRecommendedActionForStoppedArray', () => {
  it('recommends assemble for assemblable arrays', () => {
    const arr = stopped({ name: 'md1', stoppedState: 'assemblable' })
    expect(primaryRecommendedActionForStoppedArray(arr)).toBe('assemble')
  })

  it('recommends zero_superblock for orphan metadata', () => {
    const arr = stopped({
      name: 'unknown',
      members: [{ path: '/dev/sda1', present: true, memberStatus: 'orphan_metadata' }],
    })
    expect(isOrphanStoppedArray(arr)).toBe(true)
    expect(primaryRecommendedActionForStoppedArray(arr)).toBe('zero_superblock')
  })
})

describe('isAssemblableStoppedArray', () => {
  it('returns false for ambiguous state', () => {
    expect(isAssemblableStoppedArray(stopped({ name: 'md2', stoppedState: 'ambiguous' }))).toBe(false)
  })
})
