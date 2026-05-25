import { describe, expect, it } from 'vitest'
import {
  collectFileioDevicesFromConfig,
  collectLunMappingsFromConfig,
  deviceNamesMappedInLuns,
} from '~/utils/fs-scst-inventory'
import type { ScstConfig } from '~/types/esos'

const config: ScstConfig = {
  handlers: [
    {
      name: 'vdisk_fileio',
      devices: [
        { name: 'vd1', filename: '/mnt/vdisks/fs01/a.img', attrs: { nv_cache: '1' } },
      ],
    },
    {
      name: 'vdisk_blockio',
      devices: [{ name: 'blk1', filename: '/dev/sdb', attrs: {} }],
    },
  ],
  drivers: [
    {
      name: 'iscsi',
      targets: [
        {
          name: 'iqn.test',
          enabled: true,
          groups: [
            {
              name: 'g1',
              luns: [{ id: 2, device: 'vd1', readOnly: true }],
              initiators: ['iqn.1994-05.com.redhat:client'],
            },
          ],
          luns: [],
        },
      ],
    },
  ],
} as ScstConfig

describe('fs-scst-inventory', () => {
  it('collects FILEIO devices with mapped flag', () => {
    const luns = collectLunMappingsFromConfig(config)
    const mapped = deviceNamesMappedInLuns(luns)
    const fileio = collectFileioDevicesFromConfig(config, mapped)
    expect(fileio).toHaveLength(1)
    expect(fileio[0].mapped).toBe(true)
    expect(fileio[0].attrs.nv_cache).toBe('1')
  })

  it('merges sysfs nv_cache into attrs', () => {
    const sysfs = new Map([
      ['vd1', { name: 'vd1', filename: '/mnt/vdisks/fs01/a.img', attrs: { nv_cache: '2' } }],
    ])
    const fileio = collectFileioDevicesFromConfig(config, new Set(), sysfs)
    expect(fileio[0].attrs.nv_cache).toBe('2')
    const sysfsOnly = collectFileioDevicesFromConfig({ handlers: [], drivers: [] }, new Set(), sysfs)
    expect(sysfsOnly[0].sysfsPresent).toBe(true)
  })

  it('flattens LUN mappings', () => {
    const luns = collectLunMappingsFromConfig(config)
    expect(luns[0].lunId).toBe(2)
    expect(luns[0].readOnly).toBe(true)
    expect(luns[0].handler).toBe('vdisk_fileio')
  })

  it('includes group initiators on LUN mappings', () => {
    const luns = collectLunMappingsFromConfig(config)
    expect(luns[0].initiators).toEqual(['iqn.1994-05.com.redhat:client'])
  })
})
