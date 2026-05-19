import { describe, expect, it, vi } from 'vitest'
import { parseMdadmExamineOutput } from '../server/utils/parsers/mdadm-examine.parser'
import {
  verifyMdSuperblockRemoved,
  zeroMdSuperblockOnPartition,
} from '../server/utils/raid-md-actions'
import { membersStillInStoppedArrays, isZeroCleanupFullyVerified } from '../utils/stopped-md'
import type { StoppedMdArray } from '../types/raid'

describe('mdadm examine after zero', () => {
  it('treats "No md superblock" as removed', () => {
    expect(parseMdadmExamineOutput('No md superblock detected on /dev/sda1.')).toBeUndefined()
  })
})

describe('zero superblock SSH flow', () => {
  it('runs mdadm --zero-superblock and verifies with multi-probe diagnostics', async () => {
    const calls: string[] = []
    const manager = {
      exec: vi.fn(async (cmd: string) => {
        calls.push(cmd)
        if (cmd.includes('--zero-superblock')) {
          return { stdout: 'zero ok\n__MD_ZERO_EXIT__=0\n', stderr: '' }
        }
        if (cmd.includes('--examine')) {
          return { stdout: 'No md superblock detected on /dev/sda1.\n__PROBE_EXIT__=0\n', stderr: '' }
        }
        if (cmd.includes('wipefs -n')) {
          return { stdout: '__PROBE_EXIT__=0\n', stderr: '' }
        }
        if (cmd.includes('blkid')) {
          return { stdout: '__PROBE_EXIT__=0\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      }),
    }

    const result = await zeroMdSuperblockOnPartition(manager as any, '/dev/sda1')
    expect(result.success).toBe(true)
    expect(result.verifiedRemoved).toBe(true)
    expect(result.diagnostics?.verifiedRemoved).toBe(true)
    expect(calls.some(c => c.includes('mdadm --zero-superblock /dev/sda1'))).toBe(true)
    expect(calls.some(c => c.includes('mdadm --examine'))).toBe(true)
    expect(calls.some(c => c.includes('wipefs -n'))).toBe(true)
  })

  it('verifyMdSuperblockRemoved returns false when superblock remains', async () => {
    const manager = {
      exec: vi.fn(async () => ({
        stdout: '          Magic : a92b4efc\n     Raid Level : raid1\n',
        stderr: '',
      })),
    }
    const { verifiedRemoved } = await verifyMdSuperblockRemoved(manager as any, '/dev/sdb1')
    expect(verifiedRemoved).toBe(false)
  })
})

describe('stopped-md zero UI helpers', () => {
  const orphan: StoppedMdArray = {
    name: 'unknown',
    raidLevel: '1',
    raidDevices: 2,
    stoppedState: 'stopped',
    warnings: [],
    detectedOn: 'examine',
    members: [{ path: '/dev/sda1', present: true, memberStatus: 'orphan_metadata' }],
  }

  it('membersStillInStoppedArrays detects lingering paths', () => {
    expect(membersStillInStoppedArrays(['/dev/sda1'], [orphan])).toEqual(['/dev/sda1'])
    expect(membersStillInStoppedArrays(['/dev/sda1'], [])).toEqual([])
  })

  it('isZeroCleanupFullyVerified requires MD metadata removed per partition', () => {
    expect(isZeroCleanupFullyVerified({
      ok: true,
      warnings: [],
      results: [{ success: true, verifiedRemoved: true, mdMetadataRemoved: true }],
    })).toBe(true)
    expect(isZeroCleanupFullyVerified({
      ok: true,
      warnings: ['signature non-RAID vfat'],
      results: [{ success: true, verifiedRemoved: true, mdMetadataRemoved: true }],
    })).toBe(true)
    expect(isZeroCleanupFullyVerified({
      ok: true,
      warnings: [],
      results: [{ success: true, verifiedRemoved: false, mdMetadataRemoved: false }],
    })).toBe(false)
  })
})
