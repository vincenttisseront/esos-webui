import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  advancedCleanupMembersForArray,
  loadPendingAdvancedCleanup,
  pendingAdvancedStorageKey,
  savePendingAdvancedCleanup,
} from '../utils/stopped-md'
import type { PartitionMetadataDiagnostics } from '../types/raid'

const sampleDiag = (partition: string): PartitionMetadataDiagnostics => ({
  partition,
  zeroSuperblock: { command: 'z', exitCode: 0, stdout: '', stderr: '', success: true },
  mdadmExamine: { command: 'e', exitCode: 0, stdout: '', stderr: '', detected: true },
  wipefsProbe: { command: 'w', exitCode: 0, stdout: '', stderr: '', signatures: [] },
  blkidProbe: { command: 'b', exitCode: 0, stdout: '', stderr: '', types: [], available: true },
  verifiedRemoved: false,
  remainingSignatureTypes: ['mdadm_examine'],
  detectionSources: { mdadmExamine: true, wipefs: false, blkid: false },
  recommendedAction: 'advanced_wipe_signatures',
})

describe('advanced cleanup UI helpers', () => {
  it('advancedCleanupMembersForArray returns intersection with pending keys', () => {
    const pending = {
      '/dev/sda1': sampleDiag('/dev/sda1'),
      '/dev/sdb1': sampleDiag('/dev/sdb1'),
    }
    expect(advancedCleanupMembersForArray(['/dev/sda1', '/dev/sdc1'], pending)).toEqual(['/dev/sda1'])
    expect(advancedCleanupMembersForArray([], pending)).toEqual([])
  })

  describe('sessionStorage persistence', () => {
    const sanId = 'san-test-1'
    const key = pendingAdvancedStorageKey(sanId)

    beforeEach(() => {
      vi.stubGlobal('sessionStorage', {
        store: {} as Record<string, string>,
        getItem(k: string) { return this.store[k] ?? null },
        setItem(k: string, v: string) { this.store[k] = v },
        removeItem(k: string) { delete this.store[k] },
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('save and load pending diagnostics', () => {
      const pending = { '/dev/sda1': sampleDiag('/dev/sda1') }
      savePendingAdvancedCleanup(sanId, pending)
      expect(key in (sessionStorage as any).store).toBe(true)
      expect(loadPendingAdvancedCleanup(sanId)).toEqual(pending)
    })

    it('clear removes storage key', () => {
      savePendingAdvancedCleanup(sanId, { '/dev/sda1': sampleDiag('/dev/sda1') })
      savePendingAdvancedCleanup(sanId, {})
      expect(loadPendingAdvancedCleanup(sanId)).toEqual({})
    })
  })
})
