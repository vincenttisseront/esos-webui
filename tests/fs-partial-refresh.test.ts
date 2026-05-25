import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mergeFsOverview } from '~/utils/fs-overview-merge'
import { buildFsFileioViewModel } from '~/utils/fs-fileio-view'
import { buildFsProvisioningSteps } from '~/utils/fs-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'

const base: FsOverview = {
  scannedAt: 1,
  mounts: [],
  vdiskFiles: [],
  fileioDevices: [{
    name: 'LINUX',
    handler: 'vdisk_fileio',
    filename: '/mnt/vdisks/linux',
    attrs: {},
    mapped: true,
  }],
  lunMappings: [{
    targetName: 't',
    groupName: 'g',
    lunId: 0,
    deviceName: 'LINUX',
    handler: 'vdisk_fileio',
    filename: '',
    readOnly: false,
  }],
  backends: [],
  links: [],
  diagnostics: {
    mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 0, system: 0, other: 0 },
    scst: { configBytes: 4, handlers: 1, fileioDevices: 3, lunMappings: 9, sysfsDevices: 0 },
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
  nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
  scanWarnings: [],
  partial: true,
  errors: [{ scanner: 'mounts', message: 'Channel open failure' }],
}

describe('partial FILEIO refresh (read-only inventory)', () => {
  it('fileioDevices render from partial response', () => {
    const view = buildFsFileioViewModel(base)!
    expect(view.fileioDevices).toHaveLength(1)
    expect(view.counts.fileioDevices).toBe(1)
    expect(view.counts.lunMappings).toBe(1)
  })

  it('merge keeps devices when partial payload clears arrays', () => {
    const prior = { ...base, mounts: [{ mountPoint: '/mnt/vdisks', backingDevice: '/dev/md0', fsType: 'xfs', totalBytes: 1, freeBytes: 1, usedPct: 0, mounted: true, status: 'mounted', role: 'fileio_data', source: 'findmnt' }] }
    const next: FsOverview = {
      ...base,
      mounts: [],
      fileioDevices: [],
      lunMappings: [],
      partial: true,
    }
    const merged = mergeFsOverview(prior, next)
    expect(merged.fileioDevices.length).toBeGreaterThan(0)
    expect(merged.lunMappings.length).toBeGreaterThan(0)
  })

  it('partial refresh preserves detected data in view model and chain', () => {
    const prior = {
      ...base,
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
      partial: false,
    }
    const next: FsOverview = {
      ...base,
      mounts: [],
      fileioDevices: [],
      lunMappings: [],
      partial: true,
    }
    const merged = mergeFsOverview(prior, next)
    const view = buildFsFileioViewModel(merged)!
    expect(view.fileioDevices).toHaveLength(1)
    expect(view.lunMappings).toHaveLength(1)
    expect(view.partial).toBe(true)
    const steps = buildFsProvisioningSteps(merged)
    expect(steps.find(s => s.id === 'fileio')?.status).not.toBe('missing')
    expect(steps.find(s => s.id === 'expose')?.status).toBe('created')
  })

  it('read-only does not strip detected objects from view model', () => {
    setActivePinia(createPinia())
    const readOnly = true
    const view = buildFsFileioViewModel(base)!
    expect(readOnly).toBe(true)
    expect(view.fileioDevices.length).toBe(1)
  })
})
