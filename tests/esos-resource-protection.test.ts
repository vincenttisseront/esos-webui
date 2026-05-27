import { describe, expect, it } from 'vitest'
import {
  buildEsosSystemProtection,
  detectSystemProtectedResources,
} from '../server/utils/esos-system-protection'
import { runFsPreflight } from '../server/utils/fs-preflight'
import type { RaidBlockDevice } from '../server/utils/raid-types'
import {
  isFilePathEsosProtected,
  isMountPointEsosProtected,
} from '../utils/esos-resource-protection'
import { mountsEligibleForVdisk } from '../utils/fs-wizard-filters'
import type { FileSystemMount, FsOverview } from '../types/filesystem'

function part(path: string, label: string, parent?: string): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 100e9,
    type: 'part',
    label,
    parent: parent ?? path.replace(/p?\d+$/, '').replace('/dev/', ''),
    usedBy: [],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

function disk(path: string): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 500e9,
    type: 'disk',
    usedBy: [],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

describe('esos-resource-protection', () => {
  it('esos_root on /dev/sda2 protects /dev/sda via detectSystemProtectedResources', () => {
    const snap = detectSystemProtectedResources({
      blockDevices: [disk('/dev/sda'), part('/dev/sda2', 'esos_root', 'sda')],
      hardwareControllers: [],
    })
    expect(snap.protectedDiskPaths).toContain('/dev/sda')
    expect(snap.protectedMountPoints).toContain('/mnt/root')
  })

  it('/mnt/root/PRIMARY-root.sqsh is not offered as vdisk mount context', () => {
    const snap = detectSystemProtectedResources({
      blockDevices: [disk('/dev/sda'), part('/dev/sda2', 'esos_root', 'sda')],
      hardwareControllers: [],
    })
    expect(isFilePathEsosProtected('/mnt/root/PRIMARY-root.sqsh', snap)).toBe(true)
    const mounts: FileSystemMount[] = [
      { mountPoint: '/mnt/root', mounted: true, role: 'system', backingDevice: '/dev/sda2', sizeBytes: 1, usedBytes: 0, freeBytes: 0 },
      { mountPoint: '/mnt/vdisks', mounted: true, role: 'fileio_data', backingDevice: '/dev/sdb1', sizeBytes: 1, usedBytes: 0, freeBytes: 1e9 },
    ]
    const eligible = mountsEligibleForVdisk(mounts, snap)
    expect(eligible.map(m => m.mountPoint)).toEqual(['/mnt/vdisks'])
  })

  it('FILEIO preflight rejects protected squash file', async () => {
    const snap = buildEsosSystemProtection({
      blockDevices: [disk('/dev/sda'), part('/dev/sda2', 'esos_root', 'sda')],
      hardwareControllers: [],
    })
    const overview = {
      scannedAt: Date.now(),
      mounts: [],
      vdiskFiles: [],
      fileioDevices: [],
      lunMappings: [],
      backends: [],
      links: [],
      diagnostics: { findmntCount: 0, lsblkCount: 0, dfCount: 0, mounts: [], scstConfigBytes: 0, scstHandlers: 0, fileioCount: 0, lunCount: 0, sysfsDeviceCount: 0, vdiskFileCount: 0, backends: { total: 0, eligible: 0, byKind: {} }, vdiskScanRoots: [], excludedMounts: [], warnings: [] },
      tools: { mkfs_xfs: true, mkfs_ext4: true, parted: true, fallocate: true, df: true, findmnt: true, blkid: true },
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
      scanWarnings: [],
      systemProtection: snap,
    } as FsOverview
    const manager = { exec: async () => ({ stdout: '', stderr: '' }) } as any
    const pre = await runFsPreflight(manager, overview, {
      action: 'bind_fileio',
      payload: { deviceName: 'testvd', vdiskPath: '/mnt/root/PRIMARY-root.sqsh', nvCache: true },
    })
    expect(pre.ok).toBe(false)
    expect(pre.blockers.some(b => b.includes('protégé'))).toBe(true)
  })

  it('create_vdisk preflight rejects protected mount', async () => {
    const snap = buildEsosSystemProtection({
      blockDevices: [],
      hardwareControllers: [],
    })
    snap.protectedMountPoints = ['/', '/mnt/root']
    const overview = {
      scannedAt: Date.now(),
      mounts: [{ mountPoint: '/mnt/root', mounted: true, role: 'system', backingDevice: '/dev/sda2', sizeBytes: 1, usedBytes: 0, freeBytes: 0 }],
      vdiskFiles: [],
      fileioDevices: [],
      lunMappings: [],
      backends: [],
      links: [],
      diagnostics: { findmntCount: 0, lsblkCount: 0, dfCount: 0, mounts: [], scstConfigBytes: 0, scstHandlers: 0, fileioCount: 0, lunCount: 0, sysfsDeviceCount: 0, vdiskFileCount: 0, backends: { total: 0, eligible: 0, byKind: {} }, vdiskScanRoots: [], excludedMounts: [], warnings: [] },
      tools: { mkfs_xfs: true, mkfs_ext4: true, parted: true, fallocate: true, df: true, findmnt: true, blkid: true },
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
      scanWarnings: [],
      systemProtection: snap,
    } as FsOverview
    const pre = await runFsPreflight({ exec: async () => ({ stdout: '', stderr: '' }) } as any, overview, {
      action: 'create_vdisk',
      payload: { mountPoint: '/mnt/root', fileName: 'x.img', sizeBytes: 2 ** 30, allocMode: 'fallocate' },
    })
    expect(pre.ok).toBe(false)
    expect(isMountPointEsosProtected('/mnt/root', snap)).toBe(true)
  })
})
