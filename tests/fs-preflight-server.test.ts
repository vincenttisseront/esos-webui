import { describe, expect, it, vi } from 'vitest'
import type { FsOverview } from '~/types/filesystem'
import { runFsPreflight } from '../server/utils/fs-preflight'

vi.mock('../server/utils/fs-candidates', () => ({
  collectFsBackendCandidates: vi.fn().mockResolvedValue([]),
}))

function baseOverview(overrides?: Partial<FsOverview>): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [
      {
        mountPoint: '/mnt/vdisks/fs01',
        backingDevice: '/dev/mapper/data-fs01',
        fsType: 'xfs',
        totalBytes: 20_000_000_000,
        freeBytes: 10_000_000_000,
        usedPct: 50,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'df',
      },
    ],
    vdiskFiles: [
      {
        path: '/mnt/vdisks/fs01/existing.img',
        fileName: 'existing.img',
        sizeBytes: 1_000_000,
        mountPoint: '/mnt/vdisks/fs01',
        scstDeviceNames: [],
        mapped: false,
      },
    ],
    fileioDevices: [
      {
        name: 'fileio01',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/fs01/existing.img',
        attrs: {},
        mapped: true,
      },
    ],
    lunMappings: [],
    backends: [],
    links: [],
    diagnostics: {
      configBytes: 0,
      handlers: 1,
      fileioDevices: 1,
      lunMappings: 0,
      sysfsDevices: 0,
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
    nextAction: { kind: 'none', messageKey: 'storage.fs.next.none' },
    scanWarnings: [],
    ...overrides,
  }
}

const manager = {} as import('../server/utils/ssh-session-manager').SSHSessionManager

describe('runFsPreflight — create_vdisk', () => {
  it('blocks when size exceeds free space', async () => {
    const res = await runFsPreflight(manager, baseOverview(), {
      action: 'create_vdisk',
      payload: {
        mountPoint: '/mnt/vdisks/fs01',
        fileName: 'big.img',
        sizeBytes: 15_000_000_000,
        allocMode: 'fallocate',
      },
    })
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.includes('espace') || b.includes('free'))).toBe(true)
  })

  it('blocks duplicate vdisk path', async () => {
    const res = await runFsPreflight(manager, baseOverview(), {
      action: 'create_vdisk',
      payload: {
        mountPoint: '/mnt/vdisks/fs01',
        fileName: 'existing.img',
        sizeBytes: 2_000_000,
        allocMode: 'fallocate',
      },
    })
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.toLowerCase().includes('vdisk'))).toBe(true)
  })

  it('accepts valid vdisk create', async () => {
    const res = await runFsPreflight(manager, baseOverview(), {
      action: 'create_vdisk',
      payload: {
        mountPoint: '/mnt/vdisks/fs01',
        fileName: 'newdata.img',
        sizeBytes: 2_000_000_000,
        allocMode: 'fallocate',
      },
    })
    expect(res.ok).toBe(true)
    expect(res.requiredConfirmation).toContain('CREATE_VDISK')
  })
})

describe('runFsPreflight — bind_fileio', () => {
  it('blocks unknown vdisk path', async () => {
    const res = await runFsPreflight(manager, baseOverview(), {
      action: 'bind_fileio',
      payload: {
        deviceName: 'new_fileio',
        vdiskPath: '/mnt/vdisks/fs01/missing.img',
        nvCache: true,
      },
    })
    expect(res.ok).toBe(false)
    expect(res.blockers.length).toBeGreaterThan(0)
  })

  it('blocks already mapped vdisk', async () => {
    const overview = baseOverview({
      vdiskFiles: [
        {
          path: '/mnt/vdisks/fs01/mapped.img',
          fileName: 'mapped.img',
          sizeBytes: 1_000_000,
          mountPoint: '/mnt/vdisks/fs01',
          scstDeviceNames: ['dev1'],
          mapped: true,
        },
      ],
    })
    const res = await runFsPreflight(manager, overview, {
      action: 'bind_fileio',
      payload: {
        deviceName: 'fileio_new',
        vdiskPath: '/mnt/vdisks/fs01/mapped.img',
        nvCache: false,
      },
    })
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.toLowerCase().includes('mapp'))).toBe(true)
  })

  it('accepts unmapped vdisk with nv_cache preview', async () => {
    const overview = baseOverview({
      vdiskFiles: [
        {
          path: '/mnt/vdisks/fs01/free.img',
          fileName: 'free.img',
          sizeBytes: 1_000_000,
          mountPoint: '/mnt/vdisks/fs01',
          scstDeviceNames: [],
          mapped: false,
        },
      ],
    })
    const res = await runFsPreflight(manager, overview, {
      action: 'bind_fileio',
      payload: {
        deviceName: 'fileio_new',
        vdiskPath: '/mnt/vdisks/fs01/free.img',
        nvCache: true,
      },
    })
    expect(res.ok).toBe(true)
    expect(res.configPreview.join('\n')).toContain('nv_cache')
    expect(res.requiredConfirmation).toBe('BIND_FILEIO fileio_new')
  })
})
