import { describe, expect, it } from 'vitest'
import type { FsOverview, VDiskFile } from '~/types/filesystem'
import {
  eligibleVdisksForFileioBind,
  hasEligibleVdisksForFileioBind,
  isVdiskEligibleForFileioBind,
} from '~/utils/fs-fileio-eligible-vdisks'

function vdisk(partial: Partial<VDiskFile> & Pick<VDiskFile, 'path'>): VDiskFile {
  return {
    fileName: partial.path.split('/').pop() ?? 'disk',
    sizeBytes: 1e9,
    mountPoint: '/mnt/vdisks',
    scstDeviceNames: [],
    mapped: false,
    ...partial,
  }
}

const overview: Pick<FsOverview, 'fileioDevices'> = {
  fileioDevices: [{
    name: 'DISK1',
    handler: 'vdisk_fileio',
    filename: '/mnt/vdisks/disk1',
    attrs: {},
    mapped: false,
  }],
}

describe('fs-fileio-eligible-vdisks', () => {
  it('returns no eligible vdisks when all are registered as FILEIO', () => {
    const files = [
      vdisk({ path: '/mnt/vdisks/disk1' }),
      vdisk({ path: '/mnt/vdisks/disk2', mapped: true }),
    ]
    const eligible = eligibleVdisksForFileioBind(files, overview)
    expect(eligible).toHaveLength(0)
    expect(hasEligibleVdisksForFileioBind(files, overview)).toBe(false)
  })

  it('returns eligible unregistered vdisk', () => {
    const free = vdisk({ path: '/mnt/vdisks/free' })
    const eligible = eligibleVdisksForFileioBind([vdisk({ path: '/mnt/vdisks/disk1' }), free], overview)
    expect(eligible).toEqual([free])
    expect(isVdiskEligibleForFileioBind(free, overview)).toBe(true)
  })

  it('rejects vdisk with SCST mapping but no FILEIO row', () => {
    const mapped = vdisk({
      path: '/mnt/vdisks/other',
      mapped: true,
      scstDeviceNames: ['OTHER'],
    })
    expect(isVdiskEligibleForFileioBind(mapped, { fileioDevices: [] })).toBe(false)
  })
})
