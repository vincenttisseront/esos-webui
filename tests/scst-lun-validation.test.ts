import { describe, it, expect } from 'vitest'
import {
  validateMapLun,
  validateUnmapLun,
  lunIdUsedOnTarget,
  expectedUnmapLunConfirmation,
} from '../utils/scst-lun-validation'
import type { ScstConfig, Target } from '../types/esos'

const target: Target = {
  name: 'iqn.t1',
  driver: 'iscsi',
  enabled: true,
  hwTarget: false,
  attrs: {},
  groups: [
    { name: 'g1', initiators: [], luns: [{ id: 0, device: 'disk_a', readOnly: false, attrs: {} }] },
    { name: 'g2', initiators: [], luns: [] },
  ],
  luns: [],
  sessions: [],
}

const config: ScstConfig = {
  handlers: [
    {
      name: 'vdisk_blockio',
      devices: [
        { name: 'disk_a', handler: 'vdisk_blockio', filename: '/dev/x', attrs: {} },
        { name: 'disk_b', handler: 'vdisk_blockio', filename: '/dev/y', attrs: {} },
      ],
    },
    {
      name: 'vdisk_fileio',
      devices: [
        { name: 'file_a', handler: 'vdisk_fileio', filename: '/mnt/vdisk', attrs: {} },
      ],
    },
    {
      name: 'nullio',
      devices: [
        { name: 'null_dev', handler: 'nullio', filename: '', attrs: {} },
      ],
    },
  ],
  drivers: [],
}

describe('validateMapLun', () => {
  it('accepts valid mapping', () => {
    const r = validateMapLun(
      { lunId: 1, deviceName: 'disk_b' },
      { config, target, groupName: 'g2' },
    )
    expect(r.ok).toBe(true)
  })

  it('rejects duplicate lun id in group', () => {
    const r = validateMapLun(
      { lunId: 0, deviceName: 'disk_b' },
      { config, target, groupName: 'g1' },
    )
    expect(r.ok).toBe(false)
  })

  it('rejects already mapped device on target', () => {
    const r = validateMapLun(
      { lunId: 2, deviceName: 'disk_a' },
      { config, target, groupName: 'g2' },
    )
    expect(r.ok).toBe(false)
  })

  it('accepts vdisk_fileio device', () => {
    const r = validateMapLun(
      { lunId: 1, deviceName: 'file_a' },
      { config, target, groupName: 'g2' },
    )
    expect(r.ok).toBe(true)
    expect(r.previewLine).toContain('file_a')
  })

  it('rejects handler outside allowlist', () => {
    const r = validateMapLun(
      { lunId: 1, deviceName: 'null_dev' },
      { config, target, groupName: 'g2' },
    )
    expect(r.ok).toBe(false)
    expect(r.errorKey).toContain('handler_not_allowed')
  })
})

describe('lunIdUsedOnTarget', () => {
  it('skips except group when checking other groups', () => {
    expect(lunIdUsedOnTarget(target, 0, 'g2')).toBe(true)
    expect(lunIdUsedOnTarget(target, 0, 'g1')).toBe(false)
  })
})

describe('expectedUnmapLunConfirmation', () => {
  it('formats phrase', () => {
    expect(expectedUnmapLunConfirmation('t', 'g', 3)).toBe('UNMAP LUN t/g/3')
  })
})

describe('validateUnmapLun', () => {
  it('accepts existing lun', () => {
    expect(validateUnmapLun(0, target, 'g1').ok).toBe(true)
  })
})
