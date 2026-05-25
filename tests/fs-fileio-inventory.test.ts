import { describe, expect, it } from 'vitest'
import { extractFileioInventory } from '~/utils/fs-fileio-inventory'
import type { FsOverview } from '~/types/filesystem'

const emptyDiagnostics = {
  mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 0, system: 0, other: 0 },
  scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
  candidates: { total: 0, eligible: 0, byKind: {} },
  vdiskScanRoots: [],
  excludedMounts: [],
  warnings: [],
}

function baseOverview(partial: Partial<FsOverview> = {}): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [],
    vdiskFiles: [],
    fileioDevices: [],
    lunMappings: [],
    backends: [],
    links: [],
    diagnostics: emptyDiagnostics,
    tools: {
      mkfs_xfs: true,
      mkfs_ext4: true,
      parted: true,
      fallocate: true,
      df: true,
      findmnt: true,
      blkid: true,
    },
    nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
    scanWarnings: [],
    ...partial,
  }
}

describe('extractFileioInventory', () => {
  it('includes FILEIO LUNs and excludes blockio-only LUNs', () => {
    const overview = baseOverview({
      fileioDevices: [{
        name: 'LINUX',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/linux',
        attrs: {},
        mapped: true,
      }],
      lunMappings: [
        {
          targetName: 't1',
          groupName: 'g',
          lunId: 0,
          deviceName: 'LINUX',
          handler: 'vdisk_fileio',
          filename: '/mnt/vdisks/linux',
          readOnly: false,
        },
        {
          targetName: 't1',
          groupName: 'g',
          lunId: 1,
          deviceName: 'blk1',
          handler: 'vdisk_blockio',
          filename: '/dev/sdb',
          readOnly: false,
        },
      ],
    })
    const inv = extractFileioInventory(overview)
    expect(inv.lunMappings).toHaveLength(1)
    expect(inv.lunMappings[0].deviceName).toBe('LINUX')
  })
})
