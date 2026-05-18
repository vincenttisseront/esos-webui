import { describe, expect, it } from 'vitest'
import {
  extractFetchError,
  formatDiagnosticsSummary,
  getZeroCleanupErrorResults,
  hasAdvancedWipeAvailable,
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

  it('getZeroCleanupErrorResults reads results from error data', () => {
    const err = {
      data: {
        results: [{ partition: '/dev/sda1', success: true, verifiedRemoved: false }],
      },
    }
    expect(getZeroCleanupErrorResults(err)).toHaveLength(1)
    expect(getZeroCleanupErrorResults({})).toEqual([])
  })

  it('hasAdvancedWipeAvailable detects flag and recommendedAction', () => {
    expect(hasAdvancedWipeAvailable({ data: { advancedCleanupAvailable: true } })).toBe(true)
    expect(hasAdvancedWipeAvailable({
      data: {
        results: [{
          diagnostics: { recommendedAction: 'advanced_wipe_signatures' },
        }],
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
