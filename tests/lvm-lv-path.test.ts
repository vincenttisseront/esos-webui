import { describe, expect, it } from 'vitest'
import {
  buildLvPathCandidates,
  lvmMapperDevicePath,
  pickLvBackingPathFromReport,
} from '../utils/lvm-lv-path'
import { mapParsedLvToLogicalVolume } from '../server/utils/lvm-lv-mapper'

describe('lvm-lv-path', () => {
  it('builds mapper path with escaped hyphens', () => {
    expect(lvmMapperDevicePath('my-vg', 'snap-1')).toBe('/dev/mapper/my--vg-snap--1')
  })

  it('prefers lv_dm_path over legacy /dev/vg/lv', () => {
    const r = pickLvBackingPathFromReport('data', 'photos', {
      lvPath: '/dev/data/photos',
      lvDmPath: '/dev/mapper/data-photos',
    })
    expect(r.backingPath).toBe('/dev/mapper/data-photos')
    expect(r.displayName).toBe('data/photos')
    expect(r.pathCandidates).toContain('/dev/mapper/data-photos')
    expect(r.pathCandidates).toContain('/dev/data/photos')
  })

  it('uses lv_path when it is already a mapper device', () => {
    const r = pickLvBackingPathFromReport('data', 'photos', {
      lvPath: '/dev/mapper/data-photos',
    })
    expect(r.backingPath).toBe('/dev/mapper/data-photos')
  })

  it('falls back to mapper when LVM reports no paths', () => {
    const r = pickLvBackingPathFromReport('data', 'photos', {})
    expect(r.backingPath).toBe('/dev/mapper/data-photos')
  })

  it('maps overview LV with SCST on any candidate path', () => {
    const scstMap = new Map([['/dev/mapper/data-photos', ['lun0']]])
    const lv = mapParsedLvToLogicalVolume(
      {
        name: 'photos',
        vgName: 'data',
        lvPath: '/dev/data/photos',
        lvDmPath: '/dev/mapper/data-photos',
        sizeBytes: 1,
        uuid: 'u',
        attr: '-wi-ao----',
        active: true,
      },
      scstMap,
      new Map(),
    )
    expect(lv.path).toBe('/dev/mapper/data-photos')
    expect(lv.displayName).toBe('data/photos')
    expect(lv.scstDeviceNames).toEqual(['lun0'])
  })
})
