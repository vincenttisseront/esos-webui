import { describe, expect, it } from 'vitest'
import {
  advancedCleanupMembersForArray,
  extractFetchError,
  formatDiagnosticsSummary,
  getZeroCleanupErrorResults,
  hasAdvancedWipeAvailable,
  normalizePartitionPath,
} from '../utils/stopped-md'
import type { PartitionMetadataDiagnostics } from '../types/raid'

describe('stopped-md diagnostics helpers', () => {
  it('extractFetchError prefers data.message over statusMessage', () => {
    const err = {
      message: 'HTTP fallback',
      data: { message: 'Métadonnées MD encore détectées', statusMessage: 'MD metadata still present' },
    }
    expect(extractFetchError(err)).toBe('Métadonnées MD encore détectées')
  })

  it('getZeroCleanupErrorResults reads results from flat error data', () => {
    const err = {
      data: {
        results: [{ partition: '/dev/sda1', success: true, verifiedRemoved: false }],
      },
    }
    expect(getZeroCleanupErrorResults(err)).toHaveLength(1)
    expect(getZeroCleanupErrorResults({})).toEqual([])
  })

  it('getZeroCleanupErrorResults reads nested data.data.results (ofetch 422)', () => {
    const err = {
      data: {
        data: {
          ok: false,
          advancedCleanupAvailable: true,
          results: [{
            partition: '/dev/sda1',
            success: true,
            verifiedRemoved: false,
            diagnostics: {
              partition: '/dev/sda1',
              recommendedAction: 'advanced_wipe_signatures',
              verifiedRemoved: false,
              remainingSignatureTypes: ['mdadm_examine'],
              detectionSources: { mdadmExamine: true, wipefs: false, blkid: false },
            },
          }],
        },
        message: 'Métadonnées MD encore détectées',
      },
    }
    const results = getZeroCleanupErrorResults(err)
    expect(results).toHaveLength(1)
    expect(results[0].partition).toBe('/dev/sda1')
    expect(results[0].diagnostics?.recommendedAction).toBe('advanced_wipe_signatures')
    expect(extractFetchError(err)).toBe('Métadonnées MD encore détectées')
    expect(hasAdvancedWipeAvailable(err)).toBe(true)
  })

  it('normalizePartitionPath and advancedCleanupMembersForArray match keys', () => {
    expect(normalizePartitionPath('sda1')).toBe('/dev/sda1')
    const pending = {
      '/dev/sda1': { partition: '/dev/sda1', recommendedAction: 'advanced_wipe_signatures' },
    }
    expect(advancedCleanupMembersForArray(['sda1'], pending)).toEqual(['/dev/sda1'])
    expect(advancedCleanupMembersForArray(['/dev/sda1'], pending)).toEqual(['/dev/sda1'])
  })

  it('hasAdvancedWipeAvailable detects flag and recommendedAction', () => {
    expect(hasAdvancedWipeAvailable({ data: { advancedCleanupAvailable: true } })).toBe(true)
    expect(hasAdvancedWipeAvailable({
      data: {
        data: {
          results: [{
            partition: '/dev/sdb1',
            diagnostics: { recommendedAction: 'advanced_wipe_signatures' },
          }],
        },
      },
    })).toBe(true)
    expect(hasAdvancedWipeAvailable({})).toBe(false)
  })

  it('formatDiagnosticsSummary lists detection sources', () => {
    const d: PartitionMetadataDiagnostics = {
      partition: '/dev/sda1',
      zeroSuperblock: { command: 'z', exitCode: 0, stdout: '', stderr: '', success: true },
      mdadmExamine: { command: 'e', exitCode: 0, stdout: '', stderr: '', detected: false },
      wipefsProbe: { command: 'w', exitCode: 0, stdout: '', stderr: '', signatures: ['linux_raid_member'] },
      blkidProbe: { command: 'b', exitCode: 0, stdout: '', stderr: '', types: [], available: true },
      verifiedRemoved: false,
      remainingSignatureTypes: ['linux_raid_member'],
      detectionSources: { mdadmExamine: false, wipefs: true, blkid: false },
      recommendedAction: 'advanced_wipe_signatures',
    }
    const summary = formatDiagnosticsSummary(d)
    expect(summary).toContain('/dev/sda1')
    expect(summary).toContain('wipefs')
    expect(summary).toContain('linux_raid_member')
  })
})
