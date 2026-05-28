import { describe, expect, it } from 'vitest'
import type { RaidBlockDevice } from '~/types/raid'
import {
  buildDeviceDisplayTags,
  collectUniqueMountPoints,
  dedupeEligibilityReasons,
  dedupeStrings,
  dedupeUsedByTags,
  normalizeDeviceSignatures,
  pickPrimaryEligibilityReason,
} from '~/utils/block-device-display'
import { buildBackendEligibilityView } from '~/utils/fs-backend-eligibility'
import type { FsBackendRef } from '~/types/filesystem'

const t = (key: string, params?: Record<string, string>) => {
  const map: Record<string, string> = {
    'raid.block_device.reason.mounted_at': `Mounted on ${params?.mount ?? ''}`,
    'raid.block_device.reason.mounted': 'Device is mounted',
    'raid.block_device.reason.hardware_raid': 'Hardware RAID volume',
    'raid.block_device.eligibility.ineligible': `Not eligible: ${params?.reason ?? ''}`,
    'raid.block_device.eligibility.ineligible_with_more': `Not eligible: ${params?.reason ?? ''} (+${params?.count} more)`,
  }
  return map[key] ?? key
}

function blockDev(overrides: Partial<RaidBlockDevice>): RaidBlockDevice {
  return {
    name: 'sdb',
    path: '/dev/sdb',
    sizeBytes: 1e12,
    type: 'disk',
    usedBy: [],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: true,
    warnings: [],
    ...overrides,
  }
}

describe('block-device-display', () => {
  it('dedupes exact duplicate strings', () => {
    expect(dedupeStrings(['unknown_signature', 'unknown_signature', 'md'])).toEqual([
      'unknown_signature',
      'md',
    ])
  })

  it('drops generic filesystem tag when xfs signature is present', () => {
    const sigs = normalizeDeviceSignatures({
      signatures: ['xfs', 'filesystem', 'xfs'],
      fstype: 'xfs',
    })
    expect(sigs).toEqual(['xfs'])
    const tags = buildDeviceDisplayTags(blockDev({
      fstype: 'xfs',
      diskSignatures: ['xfs', 'filesystem'],
      usedBy: ['mounted', 'filesystem', 'unknown_signature', 'hardware_raid'],
    }))
    expect(tags.signatures).toEqual(['xfs'])
    expect(tags.usedBy).not.toContain('filesystem')
    expect(tags.usedBy).not.toContain('unknown_signature')
    expect(tags.usedBy).toContain('hardware_raid')
  })

  it('collects unique mount points from field and reasons', () => {
    const mounts = collectUniqueMountPoints({
      mountpoint: '/mnt/vdisks/fs01',
      reasons: [
        'Monté sur /mnt/vdisks/fs01',
        'Périphérique monté',
        'Monté sur /mnt/vdisks/fs01',
      ],
    })
    expect(mounts).toEqual(['/mnt/vdisks/fs01'])
  })

  it('picks primary eligibility reason and counts extras', () => {
    const reasons = dedupeEligibilityReasons([
      'Seules les partitions existantes sont éligibles',
      'Type de partition Linux RAID Autodetect requis',
      'Monté sur /mnt/vdisks/fs01',
      'Monté sur /mnt/vdisks/fs01',
      'Volume déjà en RAID matériel — utilisez LVM, FILEIO ou SCST BLOCKIO',
    ])
    const picked = pickPrimaryEligibilityReason(reasons, t)
    expect(picked.primary).toContain('Mounted on /mnt/vdisks/fs01')
    expect(picked.moreCount).toBeGreaterThan(0)
  })

  it('dedupes FILEIO backend reason views', () => {
    const backend: FsBackendRef = {
      path: '/dev/sdb',
      kind: 'hw_raid_ld',
      source: 'hw_raid',
      sizeBytes: 1,
      eligible: false,
      reasons: [
        'storage.fs.backend.reason.mounted_at:/mnt/vdisks/fs01',
        'storage.fs.backend.reason.mounted_at:/mnt/vdisks/fs01',
        'storage.fs.backend.reason.filesystem_signature',
      ],
    }
    const view = buildBackendEligibilityView(backend)
    expect(view.reasonViews).toHaveLength(2)
  })
})
