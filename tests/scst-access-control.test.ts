import { describe, expect, it } from 'vitest'
import { parseScstConf } from '../server/utils/scst-conf-parser'
import { buildScstAccessControlFromOverview } from '~/utils/scst-access-control'
import { createEmptyOverview } from '~/types/esos'
import type { Overview } from '~/types/esos'

const GROUP_CONF = `
HANDLER vdisk_fileio {
    DEVICE LINUX {
        filename /mnt/vdisks/linux
        nv_cache 2
    }
}
TARGET_DRIVER qla2x00t {
    TARGET 21:00:00:24:ff:91:60:bc {
        GROUP default {
            INITIATOR 21:00:00:24:ff:55:68:eb
            INITIATOR iqn.1994-05.com.redhat:*
            LUN 0 LINUX
        }
    }
}
`

describe('buildScstAccessControlFromOverview', () => {
  it('builds targets with groups, initiators, and group LUNs from parsed config', () => {
    const config = parseScstConf(GROUP_CONF)
    const overview: Overview = {
      ...createEmptyOverview(),
      devices: [{
        name: 'LINUX',
        handler: 'vdisk_fileio',
        filename: '/mnt/vdisks/linux',
        attrs: { nv_cache: '2' },
      }],
      targets: config.drivers[0].targets.map(t => ({
        ...t,
        driver: config.drivers[0].name,
        sessions: [],
      })),
    }

    const ac = buildScstAccessControlFromOverview(overview, 1000)
    expect(ac.scannedAt).toBe(1000)
    expect(ac.targets).toHaveLength(1)
    const target = ac.targets[0]
    expect(target.name).toBe('21:00:00:24:ff:91:60:bc')
    expect(target.groups).toHaveLength(1)
    expect(target.groups[0].name).toBe('default')
    expect(target.groups[0].initiators).toEqual([
      '21:00:00:24:ff:55:68:eb',
      'iqn.1994-05.com.redhat:*',
    ])
    expect(target.groups[0].luns).toHaveLength(1)
    expect(target.groups[0].luns[0]).toMatchObject({
      lunId: 0,
      deviceName: 'LINUX',
      handler: 'vdisk_fileio',
      filename: '/mnt/vdisks/linux',
      readOnly: false,
    })
    expect(ac.unmappedDevices).toHaveLength(0)
  })

  it('includes target-level LUNs and lists unmapped devices', () => {
    const overview: Overview = {
      ...createEmptyOverview(),
      devices: [
        { name: 'orphan', handler: 'vdisk_blockio', filename: '/dev/sdb', attrs: {} },
        { name: 'mapped', handler: 'vdisk_fileio', filename: '/mnt/a', attrs: {} },
      ],
      targets: [{
        name: 'iqn.t',
        driver: 'iscsi',
        enabled: true,
        hwTarget: false,
        attrs: {},
        groups: [],
        luns: [{ id: 1, device: 'mapped', readOnly: true, attrs: {} }],
        sessions: [],
      }],
    }
    const ac = buildScstAccessControlFromOverview(overview)
    expect(ac.targets[0].targetLuns).toHaveLength(1)
    expect(ac.targets[0].targetLuns[0].readOnly).toBe(true)
    expect(ac.unmappedDevices).toHaveLength(1)
    expect(ac.unmappedDevices[0].name).toBe('orphan')
  })
})
