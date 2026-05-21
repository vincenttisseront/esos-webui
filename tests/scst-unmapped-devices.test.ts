import { describe, it, expect } from 'vitest'
import { unmappedDevicesFromOverview, isDeviceMapped } from '../utils/scst-unmapped-devices'
import { createEmptyOverview } from '../types/esos'
import type { Overview } from '../types/esos'

describe('unmappedDevicesFromOverview', () => {
  it('lists devices not referenced by any LUN', () => {
    const overview: Overview = {
      ...createEmptyOverview(),
      devices: [
        { name: 'a', handler: 'vdisk_blockio', filename: '/a', attrs: {} },
        { name: 'b', handler: 'vdisk_blockio', filename: '/b', attrs: {} },
      ],
      targets: [
        {
          name: 't1',
          driver: 'iscsi',
          enabled: true,
          hwTarget: false,
          attrs: {},
          groups: [{ name: 'g', initiators: [], luns: [{ id: 0, device: 'a', readOnly: false, attrs: {} }] }],
          luns: [],
          sessions: [],
        },
      ],
    }
    const unmapped = unmappedDevicesFromOverview(overview)
    expect(unmapped.map(d => d.name)).toEqual(['b'])
    expect(isDeviceMapped(overview, 'a')).toBe(true)
    expect(isDeviceMapped(overview, 'b')).toBe(false)
  })
})
