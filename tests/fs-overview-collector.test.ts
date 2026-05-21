import { describe, expect, it, vi, beforeEach } from 'vitest'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'

vi.mock('../server/utils/scst-device-index', () => ({
  readScstDeviceIndex: vi.fn().mockResolvedValue({ pathToDevices: new Map() }),
  readScstSysfsFileioMap: vi.fn().mockResolvedValue(new Map()),
}))

vi.mock('../server/utils/raid-overview.service', () => ({
  collectRaidOverview: vi.fn().mockResolvedValue({
    blockDevices: [],
    mdArrays: [],
    hardwareControllers: [],
  }),
}))

vi.mock('../server/utils/lvm-overview.service', () => ({
  collectLvmOverview: vi.fn().mockResolvedValue({ pvs: [], vgs: [], lvs: [] }),
}))

const readScstConfigMock = vi.fn().mockResolvedValue({
  handlers: [],
  drivers: [],
})

vi.mock('../server/utils/scst-config-reader', () => ({
  readScstConfig: (...args: unknown[]) => readScstConfigMock(...args),
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
    expect(overview.mounts.find(m => m.mountPoint === '/mnt/vdisks/fs01')?.role).toBe('fileio_data')
    expect(overview.nextAction.kind).toBe('create_vdisk')
    expect(overview.backends).toBeDefined()
    expect(overview.diagnostics).toBeDefined()
    expect(overview.partial).toBeFalsy()
  })

  it('returns partial overview with SCST data when mounts scanner fails', async () => {
    readScstConfigMock.mockResolvedValueOnce({
      handlers: [{
        name: 'vdisk_fileio',
        devices: [{
          name: 'LINUX',
          filename: '/mnt/vdisks/linux',
          attrs: {},
        }],
      }],
      drivers: [{
        name: 'iscsi',
        targets: [{
          name: '21:00:00:24:ff:91:60:bc',
          enabled: true,
          groups: [{
            name: 'default',
            luns: [{ id: 0, device: 'LINUX', readOnly: false }],
            initiators: [],
          }],
          luns: [],
        }],
      }],
    })

    const manager = {
      isReady: () => true,
      exec: vi.fn(async (cmd: string) => {
        if (cmd.includes('findmnt')) {
          throw new Error('Channel open failure: open failed')
        }
        return { stdout: '', stderr: '', exitCode: 0 }
      }),
    }

    const overview = await collectFsOverview(manager as any)

    expect(overview.partial).toBe(true)
    expect(overview.errors?.some(e => e.scanner === 'mounts')).toBe(true)
    expect(overview.fileioDevices.length).toBeGreaterThanOrEqual(1)
    expect(overview.lunMappings.length).toBeGreaterThanOrEqual(1)
    expect(overview.diagnostics.scst.fileioDevices).toBeGreaterThanOrEqual(1)
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
        role: 'fileio_data',
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
      backends: [],
      links: [],
      diagnostics: {
        mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 1, system: 0, other: 0 },
        scst: { configBytes: 0, handlers: 1, fileioDevices: 1, lunMappings: 1, sysfsDevices: 0 },
        candidates: { total: 0, eligible: 0, byKind: {} },
        vdiskScanRoots: [],
        excludedMounts: [],
        warnings: [],
      },
    }
    const next = computeFsNextAction(overview)
    expect(['expose', 'none']).toContain(next.kind)
  })
})
