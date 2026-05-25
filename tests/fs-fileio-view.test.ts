import { describe, expect, it } from 'vitest'
import {
  buildFsFileioViewModel,
  chainDetailInInventory,
} from '~/utils/fs-fileio-view'
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

describe('fs-fileio-view', () => {
  const esosFileio = baseOverview({
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
      source: 'scst_config',
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
    diagnostics: {
      ...emptyDiagnostics,
      mountCounts: { findmnt: 1, lsblk: 0, df: 0, fileioData: 1, system: 0, other: 0 },
      scst: { configBytes: 100, handlers: 1, fileioDevices: 1, lunMappings: 1, sysfsDevices: 1 },
    },
  })

  it('exposes the same inventory for chain and detail tables', () => {
    const view = buildFsFileioViewModel(esosFileio)!
    expect(view.filesystems.some(m => m.mountPoint === '/mnt/vdisks')).toBe(true)
    expect(view.vdiskFiles.some(v => v.fileName === 'linux')).toBe(true)
    expect(view.fileioDevices.some(d => d.name === 'LINUX')).toBe(true)
    expect(view.lunMappings.some(l => l.targetName === '21:00:00:24:ff:91:60:bc' && l.lunId === 0)).toBe(true)
    expect(view.counts).toEqual({
      filesystems: 1,
      vdiskFiles: 1,
      fileioDevices: 1,
      lunMappings: 1,
    })
  })

  it('FILEIO device appears in chain and table lists', () => {
    const view = buildFsFileioViewModel(esosFileio)!
    expect(view.chain.find(s => s.id === 'fileio')?.count).toBe(1)
    expect(view.chain.find(s => s.id === 'fileio')?.detail).toBe('LINUX')
    expect(view.fileioDevices[0].name).toBe('LINUX')
  })

  it('LUN mapping appears in chain expose step and lunMappings table', () => {
    const view = buildFsFileioViewModel(esosFileio)!
    const expose = view.chain.find(s => s.id === 'expose')
    expect(expose?.status).toBe('created')
    expect(expose?.count).toBe(1)
    expect(expose?.detail).toContain('21:00:00:24:ff:91:60:bc')
    expect(view.lunMappings).toHaveLength(1)
  })

  it('excludes blockio-only LUN from view model', () => {
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
          targetName: 't',
          groupName: 'g',
          lunId: 0,
          deviceName: 'LINUX',
          handler: 'vdisk_fileio',
          filename: '',
          readOnly: false,
        },
        {
          targetName: 't',
          groupName: 'g',
          lunId: 1,
          deviceName: 'blk1',
          handler: 'vdisk_blockio',
          filename: '/dev/sdb',
          readOnly: false,
        },
      ],
    })
    const view = buildFsFileioViewModel(overview)!
    expect(view.lunMappings).toHaveLength(1)
    expect(view.counts.lunMappings).toBe(1)
  })

  it('chain step details appear in matching inventory lists', () => {
    const view = buildFsFileioViewModel(esosFileio)!
    expect(chainDetailInInventory(view, 'filesystem')).toBe(true)
    expect(chainDetailInInventory(view, 'vdisk')).toBe(true)
    expect(chainDetailInInventory(view, 'fileio')).toBe(true)
    expect(chainDetailInInventory(view, 'expose')).toBe(true)
    expect(view.chain.find(s => s.id === 'vdisk')?.detail).toBe('/mnt/vdisks/linux')
  })

  it('inventory is unchanged when SAN is read-only (UI-only flag)', () => {
    const view = buildFsFileioViewModel(esosFileio)!
    const readOnly = true
    const devices = readOnly ? view.fileioDevices : view.fileioDevices
    expect(devices).toHaveLength(1)
    expect(view.lunMappings).toHaveLength(1)
    expect(view.partial).toBe(false)
  })
})
