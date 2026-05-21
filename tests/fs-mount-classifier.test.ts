import { describe, expect, it } from 'vitest'
import {
  classifyMountRole,
  fileioRelevantMounts,
  pickPrimaryFileioMount,
} from '~/utils/fs-mount-classifier'
import type { FileSystemMount } from '~/types/filesystem'

function mount(mp: string, role?: FileSystemMount['role']): FileSystemMount {
  return {
    mountPoint: mp,
    backingDevice: '/dev/md0',
    fsType: 'xfs',
    totalBytes: 1,
    freeBytes: 1,
    usedPct: 0,
    mounted: true,
    status: 'mounted',
    role,
    source: 'findmnt',
  }
}

describe('fs-mount-classifier', () => {
  it('classifies /mnt/root as system', () => {
    expect(classifyMountRole('/mnt/root')).toBe('system')
  })

  it('classifies /mnt/vdisks/fs01 as fileio_data', () => {
    expect(classifyMountRole('/mnt/vdisks/fs01')).toBe('fileio_data')
  })

  it('pickPrimaryFileioMount prefers vdisks over root', () => {
    const mounts = [
      mount('/mnt/root', 'system'),
      mount('/mnt/vdisks/fs01', 'fileio_data'),
    ]
    expect(pickPrimaryFileioMount(mounts)?.mountPoint).toBe('/mnt/vdisks/fs01')
  })

  it('fileioRelevantMounts excludes system', () => {
    const mounts = [mount('/mnt/root', 'system'), mount('/mnt/vdisks/fs01', 'fileio_data')]
    expect(fileioRelevantMounts(mounts)).toHaveLength(1)
  })
})
