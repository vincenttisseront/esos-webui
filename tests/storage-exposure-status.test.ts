import { describe, expect, it } from 'vitest'
import type { FsBackendRef, FsOverview } from '~/types/filesystem'
import type { LogicalVolume } from '~/types/lvm'
import { FS_BACKEND_REASON } from '~/utils/fs-backend-reasons'
import { buildFsProvisioningSteps } from '~/utils/fs-provisioning-chain'
import {
  buildExposureSummary,
  detectBackendDoubleUse,
  isFileioBackendBlockedByBlockio,
} from '~/utils/storage-exposure-status'

const blockioLv: LogicalVolume = {
  name: 'lv_data',
  displayName: 'lv_data',
  path: '/dev/mapper/vg-lv_data',
  vgName: 'vg',
  sizeBytes: 1e12,
  uuid: 'u1',
  active: true,
  usedBy: ['scst'],
  scstDeviceNames: ['DATA'],
}

const fileioLv: LogicalVolume = {
  name: 'fileio_store',
  displayName: 'fileio_store',
  path: '/dev/mapper/vg-fileio_store',
  vgName: 'vg',
  sizeBytes: 5e11,
  uuid: 'u2',
  active: true,
  usedBy: [],
  scstDeviceNames: [],
}

function blockioBackend(path = blockioLv.path): FsBackendRef {
  return {
    path,
    kind: 'lvm_lv',
    eligible: false,
    reasons: [FS_BACKEND_REASON.SCST_BLOCKIO],
    sizeBytes: 1,
    displayName: blockioLv.displayName,
  }
}

function eligibleBackend(path = fileioLv.path): FsBackendRef {
  return {
    path,
    kind: 'lvm_lv',
    eligible: true,
    reasons: [],
    sizeBytes: 1,
    displayName: fileioLv.displayName,
  }
}

function minimalOverview(partial: Partial<FsOverview> = {}): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [],
    vdiskFiles: [],
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
    nextAction: { kind: 'create_fs', messageKey: 'storage.fs.next.create_fs' },
    scanWarnings: [],
    ...partial,
  }
}

describe('storage-exposure-status', () => {
  it('blockio only => healthy', () => {
    const backends = [blockioBackend()]
    const overview = minimalOverview({ backends, nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' } })
    const chain = buildFsProvisioningSteps(overview)
    const summary = buildExposureSummary({
      backends,
      lvs: [blockioLv],
      vgs: [{ name: 'vg', freeBytes: 0 }],
      overview,
      fileioChain: chain,
    })
    expect(summary.blockio.mode).toBe('operational')
    expect(summary.fileio.mode).toBe('optional')
    expect(summary.health).toBe('ok')
    expect(summary.blockioOperationalFileioOptional).toBe(true)
  })

  it('fileio only => healthy when chain complete', () => {
    const backends = [eligibleBackend()]
    const overview = minimalOverview({
      backends,
      mounts: [{
        mountPoint: '/mnt/vdisks',
        backingDevice: fileioLv.path,
        fsType: 'xfs',
        totalBytes: 1e12,
        freeBytes: 5e11,
        usedPct: 50,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
      vdiskFiles: [{
        path: '/mnt/vdisks/disk1',
        fileName: 'disk1',
        sizeBytes: 1e9,
        mountPoint: '/mnt/vdisks',
        scstDeviceNames: ['DISK1'],
        mapped: true,
      }],
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
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
    })
    const chain = buildFsProvisioningSteps(overview)
    const summary = buildExposureSummary({
      backends,
      lvs: [fileioLv],
      vgs: [{ name: 'vg', freeBytes: 1 }],
      overview,
      fileioChain: chain,
    })
    expect(summary.blockio.mode).toBe('none')
    expect(summary.fileio.mode).toBe('operational')
    expect(summary.health).toBe('ok')
  })

  it('both on different backends => healthy', () => {
    const backends = [blockioBackend(), eligibleBackend()]
    const overview = minimalOverview({
      backends,
      mounts: [{
        mountPoint: '/mnt/vdisks',
        backingDevice: fileioLv.path,
        fsType: 'xfs',
        totalBytes: 1e12,
        freeBytes: 5e11,
        usedPct: 50,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
      vdiskFiles: [{
        path: '/mnt/vdisks/disk1',
        fileName: 'disk1',
        sizeBytes: 1e9,
        mountPoint: '/mnt/vdisks',
        scstDeviceNames: ['DISK1'],
        mapped: true,
      }],
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
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
    })
    const chain = buildFsProvisioningSteps(overview)
    const summary = buildExposureSummary({
      backends,
      lvs: [blockioLv, fileioLv],
      vgs: [{ name: 'vg', freeBytes: 1 }],
      overview,
      fileioChain: chain,
    })
    expect(summary.blockio.mode).toBe('operational')
    expect(summary.fileio.started).toBe(true)
    expect(summary.health).toBe('ok')
    expect(detectBackendDoubleUse({ backends, lvs: [blockioLv, fileioLv], overview })).toEqual([])
  })

  it('same backend for both => blocked / attention', () => {
    const backends = [blockioBackend()]
    const overview = minimalOverview({
      backends,
      mounts: [{
        mountPoint: '/mnt/vdisks',
        backingDevice: blockioLv.path,
        fsType: 'xfs',
        totalBytes: 1e12,
        freeBytes: 5e11,
        usedPct: 50,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
    })
    const conflicts = detectBackendDoubleUse({ backends, lvs: [blockioLv], overview })
    expect(conflicts).toContain(blockioLv.path)
    const chain = buildFsProvisioningSteps(overview)
    const summary = buildExposureSummary({
      backends,
      lvs: [blockioLv],
      vgs: [{ name: 'vg', freeBytes: 0 }],
      overview,
      fileioChain: chain,
    })
    expect(summary.health).toBe('attention')
    expect(summary.issues.some(i => i.code === 'backend_double_use')).toBe(true)
  })

  it('fileio absent + blockio present => no warning health', () => {
    const backends = [blockioBackend()]
    const overview = minimalOverview({ backends })
    const summary = buildExposureSummary({
      backends,
      lvs: [blockioLv],
      vgs: [{ name: 'vg', freeBytes: 0 }],
      overview,
      fileioChain: buildFsProvisioningSteps(overview),
    })
    expect(summary.fileio.mode).toBe('optional')
    expect(summary.health).toBe('ok')
    expect(summary.issues).toHaveLength(0)
  })

  it('flags FILEIO backend blocked when used by BLOCKIO', () => {
    expect(isFileioBackendBlockedByBlockio(blockioBackend())).toBe(true)
    expect(isFileioBackendBlockedByBlockio(eligibleBackend())).toBe(false)
  })
})
