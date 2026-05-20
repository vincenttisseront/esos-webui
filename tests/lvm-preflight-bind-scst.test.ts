import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { LvmOverviewResponse } from '../types/lvm'

const { readScstDeviceIndex, resolveBlockDevicePathFromCandidates } = vi.hoisted(() => ({
  readScstDeviceIndex: vi.fn(),
  resolveBlockDevicePathFromCandidates: vi.fn(),
}))

vi.mock('../server/utils/scst-device-index', () => ({ readScstDeviceIndex }))
vi.mock('../server/utils/lvm-lv-device-path', () => ({
  resolveBlockDevicePathFromCandidates,
}))

import { runLvmPreflight } from '../server/utils/lvm-preflight'

function overviewWithLv(): LvmOverviewResponse {
  return {
    scannedAt: 0,
    tools: {
      pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
      vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
    },
    pvs: [],
    vgs: [],
    lvs: [{
      name: 'photos',
      path: '/dev/mapper/data-photos',
      displayName: 'data/photos',
      pathCandidates: ['/dev/mapper/data-photos', '/dev/data/photos'],
      vgName: 'data',
      sizeBytes: 1,
      uuid: 'u',
      active: true,
      usedBy: [],
    }],
    candidates: [],
    alerts: [],
  }
}

describe('runLvmPreflight bind_scst', () => {
  beforeEach(() => {
    readScstDeviceIndex.mockReset()
    resolveBlockDevicePathFromCandidates.mockReset()
    readScstDeviceIndex.mockResolvedValue({ names: new Set(), pathToDevices: new Map() })
    resolveBlockDevicePathFromCandidates.mockResolvedValue({
      path: '/dev/mapper/data-photos',
      candidates: ['/dev/mapper/data-photos'],
    })
  })

  it('uses SSH manager parameter without ReferenceError', async () => {
    const manager = { exec: vi.fn() } as never
    const result = await runLvmPreflight(manager, {
      action: 'bind_scst',
      payload: {
        vgName: 'data',
        lvName: 'photos',
        deviceName: 'lv_data_photos',
        confirmation: '',
      },
    }, overviewWithLv())

    expect(readScstDeviceIndex).toHaveBeenCalledWith(manager)
    expect(resolveBlockDevicePathFromCandidates).toHaveBeenCalledWith(
      manager,
      ['/dev/mapper/data-photos', '/dev/data/photos'],
    )
    expect(result.ok).toBe(true)
    expect(result.requiredConfirmation).toBe('SCST DEVICE lv_data_photos')
  })
})
