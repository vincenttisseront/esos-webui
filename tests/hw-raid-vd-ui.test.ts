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

function ldWithOsPath(osDevicePath?: string): HardwareRaidLogicalDrive {
  return {
    controllerId: '0',
    id: '1/vd1',
    raidLevel: '1',
    state: 'optimal',
    devicePath: '',
    osDevicePath,
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

  it('uses osDevicePath mapping and no longer flags pending', () => {
    expect(vdNeedsOsRescan(ldWithOsPath('/dev/sdb'))).toBe(false)
    expect(vdDeviceText(ldWithOsPath('/dev/sdb'), 'Non détecté côté OS')).toBe('/dev/sdb')
  })
})
