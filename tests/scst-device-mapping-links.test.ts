import { describe, expect, it } from 'vitest'
import {
  exposeDeviceUrl,
  findDeviceMappings,
  primaryMappingViewUrl,
  targetDetailPath,
} from '~/utils/scst-device-mapping-links'
import { createEmptyOverview } from '~/types/esos'
import type { Overview } from '~/types/esos'

function fixtureOverview(): Overview {
  return {
    ...createEmptyOverview(),
    targets: [{
      name: 'iqn.target1',
      driver: 'iscsi',
      enabled: true,
      hwTarget: false,
      attrs: {},
      groups: [{
        name: 'g1',
        initiators: ['iqn.client'],
        luns: [{ id: 0, device: 'LINUX', readOnly: false, attrs: {} }],
      }],
      luns: [{ id: 2, device: 'BLK1', readOnly: false, attrs: {} }],
      sessions: [],
    }],
    devices: [],
  }
}

describe('scst-device-mapping-links', () => {
  it('finds group and target-level mappings', () => {
    const overview = fixtureOverview()
    expect(findDeviceMappings(overview, 'LINUX')).toEqual([
      { targetName: 'iqn.target1', groupName: 'g1', lunId: 0 },
    ])
    expect(findDeviceMappings(overview, 'BLK1')).toEqual([
      { targetName: 'iqn.target1', groupName: '', lunId: 2 },
    ])
    expect(findDeviceMappings(overview, 'MISSING')).toEqual([])
  })

  it('primaryMappingViewUrl points to first target detail', () => {
    const mappings = findDeviceMappings(fixtureOverview(), 'LINUX')
    expect(primaryMappingViewUrl(mappings)).toBe('/targets/iqn.target1')
  })

  it('targetDetailPath encodes exposeDevice query', () => {
    expect(targetDetailPath('iqn/a', { exposeDevice: 'DEV1' }))
      .toBe('/targets/iqn%2Fa?exposeDevice=DEV1')
  })

  it('exposeDeviceUrl uses first target when unmapped', () => {
    const overview = fixtureOverview()
    expect(exposeDeviceUrl(overview, 'NEW')).toBe('/targets/iqn.target1?exposeDevice=NEW')
  })
})
