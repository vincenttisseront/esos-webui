import { describe, expect, it } from 'vitest'
import { buildFsProvisioningSteps, computeFsNextAction } from '~/utils/fs-provisioning-chain'
import type { FsOverview } from '~/types/filesystem'

function baseOverview(partial: Partial<FsOverview> = {}): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [],
    vdiskFiles: [],
    fileioDevices: [],
    lunMappings: [],
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
        source: 'findmnt',
      }],
    })
    overview.nextAction = computeFsNextAction(overview)
    const steps = buildFsProvisioningSteps(overview)
    expect(steps.find(s => s.id === 'filesystem')?.status).toBe('created')
    expect(steps.find(s => s.id === 'vdisk')?.status).toBe('next')
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
        source: 'findmnt',
      }],
    })
    const next = computeFsNextAction(overview)
    expect(next.kind).toBe('create_vdisk')
    expect(next.messageKey).toBe('storage.fs.next.create_vdisk_in_mount')
    expect(next.messageParams?.mountPoint).toBe('/mnt/vdisks/fs01')
  })
})
