import { describe, expect, it } from 'vitest'
import { mergeFsOverview } from '~/utils/fs-overview-merge'
import { buildFsFileioViewModel } from '~/utils/fs-fileio-view'
import type { FsOverview } from '~/types/filesystem'

const emptyDiagnostics = {
  mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 0, system: 0, other: 0 },
  scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
  candidates: { total: 0, eligible: 0, byKind: {} },
  vdiskScanRoots: [],
  excludedMounts: [],
  warnings: [],
}

function priorOverview(): FsOverview {
  return {
    scannedAt: 1,
    mounts: [{
      mountPoint: '/mnt/vdisks',
      backingDevice: '/dev/md0',
      fsType: 'xfs',
      totalBytes: 1,
      freeBytes: 1,
      usedPct: 0,
      mounted: true,
      status: 'mounted',
      role: 'fileio_data',
      source: 'findmnt',
    }],
    vdiskFiles: [{
      path: '/mnt/vdisks/linux',
      fileName: 'linux',
      sizeBytes: 1,
      mountPoint: '/mnt/vdisks',
      scstDeviceNames: ['LINUX'],
      mapped: true,
    }],
    fileioDevices: [{
      name: 'LINUX',
      handler: 'vdisk_fileio',
      filename: '/mnt/vdisks/linux',
      attrs: {},
      mapped: true,
    }],
    lunMappings: [{
      targetName: '21:00:00:24:ff:91:60:bc',
      groupName: 'g',
      lunId: 0,
      deviceName: 'LINUX',
      handler: 'vdisk_fileio',
      filename: '/mnt/vdisks/linux',
      readOnly: false,
    }],
    backends: [],
    links: [],
    diagnostics: {
      ...emptyDiagnostics,
      mountCounts: { findmnt: 1, lsblk: 0, df: 0, fileioData: 1, system: 0, other: 0 },
      scst: { configBytes: 4, handlers: 1, fileioDevices: 3, lunMappings: 9, sysfsDevices: 1 },
    },
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
    scanWarnings: ['prior-warn'],
  }
}

describe('mergeFsOverview', () => {
  it('preserves prior lists when partial refresh returns empty arrays', () => {
    const prior = priorOverview()
    const partial: FsOverview = {
      ...prior,
      scannedAt: Date.now(),
      mounts: [],
      vdiskFiles: [],
      fileioDevices: [],
      lunMappings: [],
      partial: true,
      errors: [{ scanner: 'mounts', message: 'Channel open failure: open failed' }],
      diagnostics: {
        ...emptyDiagnostics,
        scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
      },
    }
    const merged = mergeFsOverview(prior, partial)
    expect(merged.fileioDevices).toHaveLength(1)
    expect(merged.lunMappings).toHaveLength(1)
    expect(merged.mounts).toHaveLength(1)
    expect(merged.vdiskFiles).toHaveLength(1)
  })

  it('merges diagnostics counts on partial refresh', () => {
    const prior = priorOverview()
    const partial: FsOverview = {
      ...prior,
      partial: true,
      diagnostics: {
        ...emptyDiagnostics,
        scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
      },
    }
    const merged = mergeFsOverview(prior, partial)
    expect(merged.diagnostics?.scst.fileioDevices).toBe(3)
    expect(merged.diagnostics?.scst.lunMappings).toBe(9)
    expect(merged.diagnostics?.mountCounts.fileioData).toBe(1)
  })

  it('view model counts match inventory array lengths', () => {
    const o = priorOverview()
    const view = buildFsFileioViewModel(o)!
    expect(view.fileioDevices.length).toBe(1)
    expect(view.counts.fileioDevices).toBe(1)
    expect(view.counts.lunMappings).toBe(1)
  })
})
