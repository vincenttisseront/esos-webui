import { describe, expect, it } from 'vitest'
import {
  buildScstRegisterPreview,
  suggestedScstDeviceName,
  validateScstDeviceName,
} from '../utils/lvm-scst-device-ui'

describe('lvm-scst-device-ui', () => {
  it('validates empty and invalid names', () => {
    expect(validateScstDeviceName('')).toBe('empty')
    expect(validateScstDeviceName('bad name')).toBe('invalid')
    expect(validateScstDeviceName('a'.repeat(33))).toBe('too_long')
    expect(validateScstDeviceName('lv_data_photos')).toBe(null)
  })

  it('builds scst_register preview', () => {
    expect(buildScstRegisterPreview('lv_data_photos', '/dev/data/photos')).toBe(
      'scst_register vdisk_blockio lv_data_photos /dev/data/photos',
    )
  })

  it('suggests device name from vg and lv', () => {
    expect(suggestedScstDeviceName('data', 'photos')).toBe('lv_data_photos')
  })
})
