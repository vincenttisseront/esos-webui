import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'

vi.mock('../server/utils/scst-device-index', () => ({
  readScstDeviceIndex: vi.fn().mockResolvedValue({ pathToDevices: new Map() }),
}))

vi.mock('../server/utils/scst-config-reader', () => ({
  readScstConfig: vi.fn().mockResolvedValue({
    handlers: [
      {
        name: 'vdisk_fileio',
        devices: [{ name: 'vdisk01', filename: '/mnt/vdisks/fs01/disk.img', attrs: { nv_cache: '1' } }],
      },
    ],
    drivers: [
      {
        name: 'iscsi',
        targets: [
          {
            name: 'iqn.test',
            groups: [{ name: 'grp1', luns: [{ id: 0, device: 'vdisk01', readOnly: false }] }],
            luns: [],
          },
        ],
      },
    ],
  }),
}))

vi.mock('../server/utils/fs-candidates', () => ({
  collectFsBackendCandidates: vi.fn().mockResolvedValue([]),
}))

import { collectFsOverview } from '../server/utils/fs-overview.service'

function mockManager(execMap: Record<string, string>) {
  return {
    isReady: () => true,
    exec: vi.fn(async (cmd: string) => {
      for (const [key, stdout] of Object.entries(execMap)) {
        if (cmd.includes(key)) return { stdout, stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    }),
  }
}

describe('collectFsOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges mount, fileio, lun mappings and nextAction', async () => {
    const findmntJson = JSON.stringify({
      filesystems: [{ target: '/mnt/vdisks/fs01', source: '/dev/md0', fstype: 'xfs' }],
    })
    const manager = mockManager({
      'findmnt -J': findmntJson,
      'df -B1': 'Filesystem 1000 100 900 10% /mnt/vdisks/fs01',
      'blkid': '',
      'fstab': '',
      'find ': '',
    })

    const overview = await collectFsOverview(manager as any)

    expect(overview.mounts.some(m => m.mountPoint === '/mnt/vdisks/fs01')).toBe(true)
    expect(overview.fileioDevices.some(d => d.name === 'vdisk01')).toBe(true)
    expect(overview.lunMappings.some(l => l.deviceName === 'vdisk01')).toBe(true)
    expect(overview.nextAction.kind).toBe('create_vdisk')
  })
})

describe('computeFsNextAction integration', () => {
  it('none when chain complete with LUN', () => {
    const overview: FsOverview = {
      scannedAt: 1,
      mounts: [{
        mountPoint: '/mnt/vdisks/fs01',
        backingDevice: '/dev/md0',
        fsType: 'xfs',
        totalBytes: 1,
        freeBytes: 1,
        usedPct: 0,
        mounted: true,
        status: 'mounted',
        source: 'findmnt',
      }],
      vdiskFiles: [{
        path: '/mnt/vdisks/fs01/a.img',
        fileName: 'a.img',
        sizeBytes: 1,
        mountPoint: '/mnt/vdisks/fs01',
        scstDeviceNames: ['vdisk01'],
        mapped: true,
      }],
      fileioDevices: [{
        name: 'vdisk01',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/fs01/a.img',
        attrs: {},
        mapped: true,
      }],
      lunMappings: [{
        targetName: 'iqn',
        groupName: 'g',
        lunId: 0,
        deviceName: 'vdisk01',
        handler: 'vdisk_fileio',
        filename: '',
        readOnly: false,
      }],
      tools: {} as any,
      nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
      scanWarnings: [],
    }
    const next = computeFsNextAction(overview)
    expect(['expose', 'none']).toContain(next.kind)
  })
})
