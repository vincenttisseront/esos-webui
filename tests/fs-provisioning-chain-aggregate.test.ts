import { describe, expect, it } from 'vitest'
import {
  buildExposeStepDetail,
  buildFileioStepDetail,
  buildVdiskStepDetailFromFiles,
  computeFileioChainAggregate,
  scopeInventoryToMount,
} from '~/utils/fs-provisioning-chain-aggregate'
import type { FileioInventory } from '~/utils/fs-fileio-inventory'
import { buildFsProvisioningSteps, computeFsNextAction } from '~/utils/fs-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'

function inv(partial: Partial<FileioInventory>): FileioInventory {
  return {
    filesystems: [],
    vdiskFiles: [],
    fileioDevices: [],
    lunMappings: [],
    backendCandidates: [],
    ...partial,
  }
}

describe('fs-provisioning-chain-aggregate', () => {
  const mount = '/mnt/vdisks/fs01'

  it('scopes vdisks and fileio to active mount', () => {
    const inventory = inv({
      vdiskFiles: [
        { path: `${mount}/data01.img`, fileName: 'data01.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: [], mapped: false },
        { path: '/mnt/other/x.img', fileName: 'x.img', sizeBytes: 1, mountPoint: '/mnt/other', scstDeviceNames: [], mapped: false },
      ],
      fileioDevices: [
        { name: 'VD1', handler: 'vdisk_fileio', filename: `${mount}/data01.img`, attrs: {}, mapped: false },
        { name: 'VD2', handler: 'vdisk_fileio', filename: '/mnt/other/x.img', attrs: {}, mapped: false },
      ],
    })
    const scoped = scopeInventoryToMount(inventory, mount)
    expect(scoped.vdiskFiles).toHaveLength(1)
    expect(scoped.fileioDevices).toHaveLength(1)
  })

  it('aggregates multi-vdisk registration counts', () => {
    const vdisks = [
      { path: `${mount}/data01.img`, fileName: 'data01.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: ['VD1'], mapped: true },
      { path: `${mount}/data02.img`, fileName: 'data02.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: [], mapped: false },
    ]
    const fileio = [
      { name: 'VD1', handler: 'vdisk_fileio' as const, filename: `${mount}/data01.img`, attrs: {}, mapped: true },
    ]
    const inventory = inv({ vdiskFiles: vdisks, fileioDevices: fileio, lunMappings: [] })
    const agg = computeFileioChainAggregate(inventory, mount)
    expect(agg.vdiskTotal).toBe(2)
    expect(agg.vdiskRegistered).toBe(1)
    expect(buildVdiskStepDetailFromFiles(vdisks, agg).detailKey).toBe('storage.fs.chain.detail.vdisk_multiple')
    expect(buildFileioStepDetail(agg, vdisks).detailKey).toBe('storage.fs.chain.detail.fileio_partial')
  })

  it('builds expose partial summary', () => {
    const fileio = [
      { name: 'VD1', handler: 'vdisk_fileio' as const, filename: `${mount}/a.img`, attrs: {}, mapped: true },
      { name: 'VD2', handler: 'vdisk_fileio' as const, filename: `${mount}/b.img`, attrs: {}, mapped: false },
    ]
    const luns = [{
      targetName: 'iqn.t',
      groupName: 'g',
      lunId: 0,
      deviceName: 'VD1',
      handler: 'vdisk_fileio',
      filename: '',
      readOnly: false,
    }]
    const inventory = inv({
      vdiskFiles: [
        { path: `${mount}/a.img`, fileName: 'a.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: ['VD1'], mapped: true },
        { path: `${mount}/b.img`, fileName: 'b.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: ['VD2'], mapped: false },
      ],
      fileioDevices: fileio,
      lunMappings: luns,
    })
    const agg = computeFileioChainAggregate(inventory, mount)
    expect(agg.fileioMapped).toBe(1)
    expect(buildExposeStepDetail(agg).detailKey).toBe('storage.fs.chain.detail.expose_partial')
  })
})

describe('computeFsNextAction aggregate messages', () => {
  it('suggests remaining bind_fileio count for multiple unregistered vdisks', () => {
    const mount = '/mnt/vdisks/fs01'
    const overview: FsOverview = {
      scannedAt: 0,
      mounts: [{
        mountPoint: mount,
        backingDevice: '/dev/md0',
        fsType: 'xfs',
        totalBytes: 1e9,
        freeBytes: 5e8,
        usedPct: 0,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
      vdiskFiles: [
        { path: `${mount}/data01.img`, fileName: 'data01.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: [], mapped: false },
        { path: `${mount}/data02.img`, fileName: 'data02.img', sizeBytes: 1, mountPoint: mount, scstDeviceNames: [], mapped: false },
      ],
      fileioDevices: [],
      lunMappings: [],
      backends: [],
      links: [],
      diagnostics: {} as FsOverview['diagnostics'],
      tools: {} as FsOverview['tools'],
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
      scanWarnings: [],
    }
    const next = computeFsNextAction(overview, { activeMountPoint: mount })
    expect(next.messageKey).toBe('storage.fs.next.bind_fileio_remaining')
    expect(next.messageParams?.count).toBe('2')
    expect(next.messageParams?.total).toBe('2')
  })
})
