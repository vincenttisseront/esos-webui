import { describe, expect, it, vi } from 'vitest'
import type { FsOverview } from '~/types/filesystem'
import { runFsPreflight } from '../server/utils/fs-preflight'
import { collectFsBackendCandidates } from '../server/utils/fs-candidates'

vi.mock('../server/utils/fs-candidates', () => ({
  collectFsBackendCandidates: vi.fn().mockResolvedValue([]),
}))

vi.mock('../server/utils/scst-config-reader', () => ({
  readScstConfig: vi.fn().mockResolvedValue({ handlers: [], drivers: [] }),
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
const mockedCollectCandidates = vi.mocked(collectFsBackendCandidates)

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
    expect(res.blockers.length).toBeGreaterThan(0)
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

describe('runFsPreflight — create_fs wipe required', () => {
  it('requires explicit wipe confirmation when backend has signatures', async () => {
    mockedCollectCandidates.mockResolvedValueOnce([{
      path: '/dev/sdb',
      kind: 'hw_raid_ld',
      sizeBytes: 100_000_000_000,
      eligible: true,
      eligibility: 'eligible_with_wipe_required',
      reasons: ['storage.fs.backend.reason.filesystem_signature'],
    }])
    const payload = {
      backendPath: '/dev/sdb',
      fsType: 'xfs' as const,
      label: 'fs01',
      mountPoint: '/mnt/vdisks/newfs',
      partitionStrategy: 'none' as const,
      allowWipeSignatures: false,
    }
    const res = await runFsPreflight(manager, baseOverview({ mounts: [] }), {
      action: 'create_fs',
      payload,
    })
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.toLowerCase().includes('signatures'))).toBe(true)
  })

  it('allows create_fs and previews wipefs command when wipe confirmed', async () => {
    mockedCollectCandidates.mockResolvedValueOnce([{
      path: '/dev/sdb',
      kind: 'hw_raid_ld',
      sizeBytes: 100_000_000_000,
      eligible: true,
      eligibility: 'eligible_with_wipe_required',
      reasons: ['storage.fs.backend.reason.filesystem_signature'],
    }])
    const payload = {
      backendPath: '/dev/sdb',
      fsType: 'xfs' as const,
      label: 'fs01',
      mountPoint: '/mnt/vdisks/newfs',
      partitionStrategy: 'none' as const,
      allowWipeSignatures: true,
    }
    const res = await runFsPreflight(manager, baseOverview({ mounts: [] }), {
      action: 'create_fs',
      payload,
    })
    expect(res.ok).toBe(true)
    expect(res.commands.some(c => c.includes('wipefs -a') && c.includes('/dev/sdb'))).toBe(true)
  })
})
