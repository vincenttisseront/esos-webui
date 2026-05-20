import { describe, expect, it } from 'vitest'
import {
  isValidLvmName,
  isValidDevicePath,
  validatePvCreate,
  validateLvCreate,
  validateBindScst,
} from '../server/utils/lvm-validation'
import type { LvmOverviewResponse } from '../types/lvm'

function emptyOverview(): LvmOverviewResponse {
  return {
    scannedAt: 0,
    tools: {
      pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
      vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
    },
    pvs: [],
    vgs: [{ name: 'vg0', uuid: 'u', sizeBytes: 10e9, freeBytes: 5e9, pvCount: 1, lvCount: 0, clustered: false }],
    lvs: [],
    candidates: [{
      path: '/dev/md0',
      kind: 'md',
      sizeBytes: 1e9,
      eligible: true,
      reasons: [],
      usedBy: [],
      signatures: [],
    }],
    alerts: [],
  }
}

describe('lvm-validation', () => {
  it('validates LVM names', () => {
    expect(isValidLvmName('vg_data')).toBe(true)
    expect(isValidLvmName('snapshot')).toBe(false)
  })

  it('validates device paths', () => {
    expect(isValidDevicePath('/dev/md0')).toBe(true)
    expect(isValidDevicePath('/etc/passwd')).toBe(false)
  })

  it('blocks pvcreate on unknown path', () => {
    const r = validatePvCreate({ path: '/dev/sdz' }, emptyOverview())
    expect(r.blockers.length).toBeGreaterThan(0)
  })

  it('allows pvcreate on eligible candidate', () => {
    const r = validatePvCreate({ path: '/dev/md0' }, emptyOverview())
    expect(r.blockers).toHaveLength(0)
  })

  it('blocks lvcreate larger than vg free', () => {
    const r = validateLvCreate({
      vgName: 'vg0',
      name: 'lv1',
      sizeBytes: 20e9,
    }, emptyOverview())
    expect(r.blockers.some(b => b.includes('libre'))).toBe(true)
  })

  it('blocks bind_scst duplicate device name', () => {
    const overview = emptyOverview()
    overview.lvs = [{
      name: 'lv1',
      path: '/dev/vg0/lv1',
      displayName: 'vg0/lv1',
      vgName: 'vg0',
      sizeBytes: 1e9,
      uuid: 'l',
      active: true,
      usedBy: [],
    }]
    const r = validateBindScst(
      { vgName: 'vg0', lvName: 'lv1', deviceName: 'dup' },
      overview,
      { names: new Set(['dup']), pathToDevices: new Map() },
      { nodeLabel: 'esos1' },
    )
    expect(r.blockers.some(b => b.includes('device_exists'))).toBe(true)
  })

  it('blocks bind_scst when LV path already bound to another device', () => {
    const overview = emptyOverview()
    overview.lvs = [{
      name: 'photos',
      path: '/dev/mapper/data-photos',
      displayName: 'data/photos',
      pathCandidates: ['/dev/mapper/data-photos', '/dev/data/photos'],
      vgName: 'data',
      sizeBytes: 1e9,
      uuid: 'l',
      active: true,
      usedBy: [],
    }]
    const pathToDevices = new Map([['/dev/data/photos', ['existing']]])
    const r = validateBindScst(
      { vgName: 'data', lvName: 'photos', deviceName: 'lv_data_photos' },
      overview,
      { names: new Set(), pathToDevices },
      { nodeLabel: 'esos1', lvPathPresent: true },
    )
    expect(r.blockers.some(b => b.includes('lv_path_in_use'))).toBe(true)
  })
})
