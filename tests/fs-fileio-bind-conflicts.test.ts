import { describe, expect, it, vi } from 'vitest'
import type { FsOverview } from '~/types/filesystem'
import {
  detectFileioBindConflicts,
  throwFileioBindConflict,
} from '~/server/utils/fs-fileio-bind-conflicts'

function minimalOverview(partial: Partial<FsOverview> = {}): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [],
    vdiskFiles: [{
      path: '/mnt/vdisks/disk1',
      fileName: 'disk1',
      sizeBytes: 1e9,
      mountPoint: '/mnt/vdisks',
      scstDeviceNames: [],
      mapped: false,
    }],
    fileioDevices: [],
    lunMappings: [],
    backends: [],
    links: [],
    diagnostics: {
      mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 0, system: 0, other: 0 },
      scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
      candidates: { total: 0, eligible: 0, byKind: {} },
      vdiskScanRoots: [],
      excludedMounts: [],
      warnings: [],
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
    nextAction: { kind: 'bind_fileio', messageKey: 'storage.fs.next.bind_fileio' },
    scanWarnings: [],
    ...partial,
  }
}

describe('detectFileioBindConflicts', () => {
  it('returns device_name_exists when SCST device already registered', () => {
    const overview = minimalOverview({
      fileioDevices: [{
        name: 'PHOTOS',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/other.img',
        attrs: {},
        mapped: false,
      }],
    })
    const conflict = detectFileioBindConflicts(overview, {
      deviceName: 'PHOTOS',
      vdiskPath: '/mnt/vdisks/disk1',
    })
    expect(conflict?.code).toBe('device_name_exists')
    expect(conflict?.deviceName).toBe('PHOTOS')
  })

  it('returns vdisk_file_already_fileio when backing file is registered', () => {
    const overview = minimalOverview({
      fileioDevices: [{
        name: 'DISK1',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/disk1',
        attrs: {},
        mapped: true,
      }],
      lunMappings: [{
        targetName: 'iqn.test',
        groupName: 'g',
        lunId: 0,
        deviceName: 'DISK1',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/disk1',
        readOnly: false,
      }],
    })
    const conflict = detectFileioBindConflicts(overview, {
      deviceName: 'NEW_NAME',
      vdiskPath: '/mnt/vdisks/disk1',
    })
    expect(conflict?.code).toBe('vdisk_file_already_fileio')
    expect(conflict?.existingDeviceName).toBe('DISK1')
    expect(conflict?.existingMapping?.lunId).toBe(0)
  })

  it('returns null when vdisk is free and name is unique', () => {
    const conflict = detectFileioBindConflicts(minimalOverview(), {
      deviceName: 'DISK1',
      vdiskPath: '/mnt/vdisks/disk1',
    })
    expect(conflict).toBeNull()
  })
})

describe('throwFileioBindConflict', () => {
  it('throws H3 error with status 409 and structured data', () => {
    expect(() => throwFileioBindConflict({
      code: 'device_name_exists',
      message: 'exists',
      deviceName: 'X',
      filePath: '/mnt/vdisks/disk1',
    })).toThrowError(expect.objectContaining({ statusCode: 409 }))
  })
})
