import { describe, expect, it } from 'vitest'
import {
  isValidMdArrayName,
  isZeroCleanupFullyVerified,
  MD_ZERO_METADATA_CONFIRMATION,
  membersStillInStoppedArrays,
  stoppedMemberPaths,
  suggestDefaultMdName,
} from '../utils/stopped-md'
import type { StoppedMdArray } from '../types/raid'

describe('stopped-md utils', () => {
  it('validates md array names', () => {
    expect(isValidMdArrayName('md0')).toBe(true)
    expect(isValidMdArrayName('md127')).toBe(true)
    expect(isValidMdArrayName('unknown')).toBe(false)
    expect(isValidMdArrayName('md')).toBe(true)
  })

  it('collects present member paths only', () => {
    const arr: StoppedMdArray = {
      name: 'md0',
      raidLevel: '1',
      raidDevices: 2,
      stoppedState: 'incomplete',
      warnings: [],
      detectedOn: 'both',
      members: [
        { path: '/dev/sdb1', present: true, memberStatus: 'incomplete' },
        { path: '—', present: false, memberStatus: 'member_missing' },
      ],
    }
    expect(stoppedMemberPaths(arr)).toEqual(['/dev/sdb1'])
  })

  it('suggests first unused md name', () => {
    const name = suggestDefaultMdName({
      scannedAt: 0,
      tools: {} as any,
      hardwareControllers: [],
      mdArrays: [{ name: 'md0' } as any],
      stoppedMdArrays: [{ name: 'md1' } as any],
      blockDevices: [],
      alerts: [],
    })
    expect(name).toBe('md2')
  })

  it('exports fixed zero metadata confirmation phrase', () => {
    expect(MD_ZERO_METADATA_CONFIRMATION).toBe('ZERO RAID METADATA')
  })

  it('isZeroCleanupFullyVerified rejects warnings or unverified partitions', () => {
    expect(isZeroCleanupFullyVerified({
      ok: true,
      warnings: [],
      results: [{ success: true, verifiedRemoved: true }],
    })).toBe(true)
    expect(membersStillInStoppedArrays(['/dev/sda1'], [])).toEqual([])
  })
})
