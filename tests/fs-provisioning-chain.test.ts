import { describe, expect, it } from 'vitest'
import { buildFsProvisioningSteps, computeFsNextAction } from '~/utils/fs-provisioning-chain'
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
    nextAction: { kind: 'create_fs', messageKey: 'storage.fs.next.create_fs' },
    scanWarnings: [],
    ...partial,
  }
}

describe('fs-provisioning-chain', () => {
  it('filesystem step created when mounts exist', () => {
    const overview = baseOverview({
      mounts: [{
        mountPoint: '/mnt/vdisks/fs01',
        backingDevice: '/dev/md0',
        fsType: 'xfs',
        totalBytes: 1e9,
        freeBytes: 5e8,
        usedPct: 50,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
    })
    overview.nextAction = computeFsNextAction(overview)
    const steps = buildFsProvisioningSteps(overview)
    expect(steps.find(s => s.id === 'filesystem')?.status).toBe('created')
    expect(steps.find(s => s.id === 'filesystem')?.detail).toBe('/mnt/vdisks/fs01')
    expect(steps.find(s => s.id === 'vdisk')?.status).toBe('next')
  })

  it('ignores /mnt/root for filesystem chain step', () => {
    const overview = baseOverview({
      mounts: [
        {
          mountPoint: '/mnt/root',
          backingDevice: '/dev/loop0',
          fsType: 'xfs',
          totalBytes: 1,
          freeBytes: 1,
          usedPct: 0,
          mounted: true,
          status: 'mounted',
          role: 'system',
          source: 'findmnt',
        },
        {
          mountPoint: '/mnt/vdisks/fs01',
          backingDevice: '/dev/md0',
          fsType: 'xfs',
          totalBytes: 1e9,
          freeBytes: 5e8,
          usedPct: 10,
          mounted: true,
          status: 'mounted',
          role: 'fileio_data',
          source: 'findmnt',
        },
      ],
      fileioDevices: [{ name: 'vd1', handler: 'vdisk_fileio', filename: '/mnt/vdisks/fs01/a.img', attrs: {}, mapped: true }],
      lunMappings: [{
        targetName: 'iqn',
        groupName: 'g',
        lunId: 0,
        deviceName: 'vd1',
        handler: 'vdisk_fileio',
        filename: '',
        readOnly: false,
      }],
    })
    const steps = buildFsProvisioningSteps(overview)
    expect(steps.find(s => s.id === 'filesystem')?.detail).toBe('/mnt/vdisks/fs01')
    expect(steps.find(s => s.id === 'expose')?.status).toBe('created')
  })

  it('full ESOS-like chain shows created expose with matching detail', () => {
    const overview = baseOverview({
      mounts: [{
        mountPoint: '/mnt/vdisks',
        backingDevice: '/dev/md0',
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
        path: '/mnt/vdisks/linux',
        fileName: 'linux',
        sizeBytes: 1e9,
        mountPoint: '/mnt/vdisks',
        scstDeviceNames: ['LINUX'],
        mapped: true,
      }],
      fileioDevices: [{
        name: 'LINUX',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/linux',
        attrs: { nv_cache: '2' },
        mapped: true,
      }],
      lunMappings: [{
        targetName: '21:00:00:24:ff:91:60:bc',
        groupName: 'default',
        lunId: 0,
        deviceName: 'LINUX',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/linux',
        readOnly: false,
      }],
    })
    overview.nextAction = computeFsNextAction(overview)
    const steps = buildFsProvisioningSteps(overview)
    expect(steps.find(s => s.id === 'vdisk')?.detail).toBe('linux')
    expect(steps.find(s => s.id === 'vdisk')?.detailKey).toBe('storage.fs.chain.detail.vdisk_single')
    expect(steps.find(s => s.id === 'fileio')?.detail).toBe('LINUX')
    expect(steps.find(s => s.id === 'expose')?.status).toBe('created')
    expect(steps.find(s => s.id === 'expose')?.detail).toContain('21:00:00:24:ff:91:60:bc')
  })

  it('shows aggregate vdisk and fileio details for multiple files on active mount', () => {
    const mount = '/mnt/vdisks/fs01'
    const overview = baseOverview({
      mounts: [{
        mountPoint: mount,
        backingDevice: '/dev/md0',
        fsType: 'xfs',
        totalBytes: 1e9,
        freeBytes: 5e8,
        usedPct: 10,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
      vdiskFiles: [
        {
          path: `${mount}/data01.img`,
          fileName: 'data01.img',
          sizeBytes: 1e9,
          mountPoint: mount,
          scstDeviceNames: ['VD01'],
          mapped: true,
        },
        {
          path: `${mount}/data02.img`,
          fileName: 'data02.img',
          sizeBytes: 1e9,
          mountPoint: mount,
          scstDeviceNames: [],
          mapped: false,
        },
      ],
      fileioDevices: [{
        name: 'VD01',
        handler: 'vdisk_fileio',
        filename: `${mount}/data01.img`,
        attrs: {},
        mapped: false,
      }],
    })
    const steps = buildFsProvisioningSteps(overview, undefined, { activeMountPoint: mount })
    expect(steps.find(s => s.id === 'vdisk')?.detailKey).toBe('storage.fs.chain.detail.vdisk_multiple')
    expect(steps.find(s => s.id === 'vdisk')?.detailParams?.count).toBe('2')
    expect(steps.find(s => s.id === 'fileio')?.detailKey).toBe('storage.fs.chain.detail.fileio_partial')
    expect(steps.find(s => s.id === 'fileio')?.detailParams?.registered).toBe('1')
  })

  it('next action suggests vdisk in mount when mount exists without vdisk', () => {
    const overview = baseOverview({
      mounts: [{
        mountPoint: '/mnt/vdisks/fs01',
        backingDevice: '/dev/md0',
        fsType: 'xfs',
        totalBytes: 1e9,
        freeBytes: 5e8,
        usedPct: 10,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
    })
    const next = computeFsNextAction(overview)
    expect(next.kind).toBe('create_vdisk')
    expect(next.messageKey).toBe('storage.fs.next.create_vdisk_in_mount')
    expect(next.messageParams?.mountPoint).toBe('/mnt/vdisks/fs01')
  })
})
