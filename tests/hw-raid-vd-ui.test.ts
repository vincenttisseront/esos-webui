import { describe, expect, it } from 'vitest'
import { vdDeviceText, vdNeedsOsRescan } from '../utils/hw-raid-vd-ui'
import type { HardwareRaidLogicalDrive } from '../types/raid'

function ld(devicePath?: string): HardwareRaidLogicalDrive {
  return {
    controllerId: '0',
    id: '0/vd1',
    raidLevel: '1',
    state: 'optimal',
    devicePath,
  }
}

describe('hw-raid-vd-ui', () => {
  it('flags VD without OS path for rescan action', () => {
    expect(vdNeedsOsRescan(ld(''))).toBe(true)
  })

  it('rescan success reflects detected device path', () => {
    expect(vdDeviceText(ld('/dev/sdb'), 'Non détecté côté OS')).toBe('/dev/sdb')
  })

  it('rescan no-result keeps not-detected text', () => {
    expect(vdDeviceText(ld(''), 'Non détecté côté OS')).toBe('Non détecté côté OS')
  })
})
