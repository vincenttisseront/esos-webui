import { describe, expect, it } from 'vitest'
import {
  buildFsBackendsAndLinks,
  buildPathAliasIndex,
  resolveCanonicalPath,
} from '../server/utils/fs-inventory-resolver'
import type { RaidOverview } from '../server/utils/raid-types'

describe('fs-inventory-resolver', () => {
  it('resolves path aliases by basename', () => {
    const index = buildPathAliasIndex([
      {
        path: '/dev/sdb',
        name: 'sdb',
        type: 'disk',
        sizeBytes: 1e9,
        usedBy: [],
      } as any,
    ])
    expect(resolveCanonicalPath('/dev/sdb', index)).toBe('/dev/sdb')
  })

  it('HW LD mounted is ineligible with mount reason', () => {
    const raid: RaidOverview = {
      blockDevices: [{
        path: '/dev/sdb',
        name: 'sdb',
        type: 'disk',
        sizeBytes: 1e12,
        usedBy: ['mounted', 'filesystem'],
        mountpoint: '/mnt/vdisks/fs01',
      }],
      mdArrays: [],
      hardwareControllers: [{
        id: '0',
        vendor: 'lsi_megaraid',
        model: 'TEST',
        cliTool: 'storcli',
        detectionSource: ['cli'],
        managementMode: 'full',
        health: 'ok',
        supportsCreate: true,
        supportsDelete: true,
        supportsHotSpare: true,
        physicalDrives: [],
        logicalDrives: [{
          controllerId: '0',
          id: '0/vd0',
          raidLevel: '1',
          sizeBytes: 1e12,
          state: 'optimal',
          devicePath: '/dev/sdb',
        }],
        warnings: [],
      }],
    } as RaidOverview

    const { backends } = buildFsBackendsAndLinks({
      raid,
      lvm: { pvs: [], vgs: [], lvs: [] } as any,
      mounts: [{
        mountPoint: '/mnt/vdisks/fs01',
        backingDevice: '/dev/sdb',
        fsType: 'xfs',
        totalBytes: 1,
        freeBytes: 1,
        usedPct: 0,
        mounted: true,
        status: 'mounted',
        role: 'fileio_data',
        source: 'findmnt',
      }],
      pathToDevices: new Map(),
    })

    const hw = backends.find(b => b.kind === 'hw_raid_ld')
    expect(hw).toBeDefined()
    expect(hw?.eligible).toBe(false)
    expect(hw?.reasons.some(r => r.startsWith('storage.fs.backend.reason.mounted'))).toBe(true)
    expect(hw?.path).toBe('/dev/sdb')
  })

  it('uses osDevicePath for HW LD backend path', () => {
    const raid: RaidOverview = {
      blockDevices: [{
        path: '/dev/sdb',
        name: 'sdb',
        type: 'disk',
        sizeBytes: 223e9,
        usedBy: ['hardware_raid'],
      }],
      mdArrays: [],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC H710',
        cliTool: 'perccli',
        detectionSource: ['cli'],
        managementMode: 'full',
        health: 'ok',
        supportsCreate: true,
        supportsDelete: true,
        supportsHotSpare: true,
        physicalDrives: [],
        logicalDrives: [{
          controllerId: '0',
          id: '1/vd1',
          raidLevel: '1',
          sizeBytes: 223e9,
          state: 'optimal',
          devicePath: '',
          osDevicePath: '/dev/sdb',
          osDeviceDetectionSource: 'lsscsi',
          osDeviceConfidence: 'high',
        }],
        warnings: [],
      }],
    } as RaidOverview

    const { backends } = buildFsBackendsAndLinks({
      raid,
      lvm: { pvs: [], vgs: [], lvs: [] } as any,
      mounts: [],
      pathToDevices: new Map(),
    })
    const hw = backends.find(b => b.kind === 'hw_raid_ld')
    expect(hw?.path).toBe('/dev/sdb')
    expect(hw?.eligible).toBe(true)
  })
})
