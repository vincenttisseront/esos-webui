import { describe, expect, it } from 'vitest'
import { buildLvmCandidatesFromInventory } from '../server/utils/lvm-candidates'
import type { MdArray } from '../server/utils/raid-types'

function mdArray(overrides: Partial<MdArray> = {}): MdArray {
  return {
    name: 'md0',
    path: '/dev/md0',
    state: 'clean',
    raidLevel: '1',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    sizeBytes: 100 * 1024 ** 3,
    usedBy: [],
    warnings: [],
    members: [],
    ...overrides,
  }
}

describe('buildLvmCandidatesFromInventory', () => {
  it('offers clean md0 from mdArrays when absent from blockDevices', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [],
      mdArrays: [mdArray()],
      pvs: [],
      lvPaths: new Set(),
    })
    const md0 = candidates.find(c => c.path === '/dev/md0')
    expect(md0).toBeDefined()
    expect(md0?.kind).toBe('md')
    expect(md0?.eligible).toBe(true)
  })

  it('marks raw whole disk ineligible for pvcreate', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sda',
        path: '/dev/sda',
        type: 'disk',
        sizeBytes: 100 * 1024 ** 3,
        usedBy: [],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: true,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      pvs: [],
      lvPaths: new Set(),
    })
    const disk = candidates.find(c => c.path === '/dev/sda')
    expect(disk?.kind).toBe('disk')
    expect(disk?.eligible).toBe(false)
    expect(disk?.reasons.some(r => r.includes('Disque brut'))).toBe(true)
  })

  it('marks partition ineligible for pvcreate', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sdb1',
        path: '/dev/sdb1',
        type: 'part',
        sizeBytes: 10 * 1024 ** 3,
        usedBy: [],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      pvs: [],
      lvPaths: new Set(),
    })
    const part = candidates.find(c => c.path === '/dev/sdb1')
    expect(part?.eligible).toBe(false)
    expect(part?.reasons.some(r => r.includes('partitions'))).toBe(true)
  })

  it('does not offer md member disk as raw PV candidate', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sda',
        path: '/dev/sda',
        type: 'disk',
        sizeBytes: 100 * 1024 ** 3,
        usedBy: ['md'],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      mdArrays: [mdArray()],
      pvs: [],
      lvPaths: new Set(),
    })
    const disk = candidates.find(c => c.path === '/dev/sda')
    expect(disk?.eligible).toBe(false)
  })

  it('offers mapped hardware RAID VD as eligible hw_raid_ld without hardware_raid tag', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sdb',
        path: '/dev/sdb',
        type: 'disk',
        sizeBytes: 223 * 1024 ** 3,
        usedBy: [],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: true,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC',
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
          id: '0/vd1',
          raidLevel: '1',
          sizeBytes: 223 * 1024 ** 3,
          state: 'optimal',
          devicePath: '/dev/sdb',
          detectionSource: 'cli',
        }],
      }],
      pvs: [],
      lvPaths: new Set(),
    })
    const vd = candidates.find(c => c.path === '/dev/sdb')
    expect(vd?.kind).toBe('hw_raid_ld')
    expect(vd?.eligible).toBe(true)
    expect(vd?.hwLdId).toBe('0/vd1')
  })

  it('offers mapped hardware RAID VD as eligible hw_raid_ld', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sdb',
        path: '/dev/sdb',
        type: 'disk',
        sizeBytes: 223 * 1024 ** 3,
        usedBy: ['hardware_raid'],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC',
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
          id: '0/vd1',
          raidLevel: '1',
          sizeBytes: 223 * 1024 ** 3,
          state: 'optimal',
          devicePath: '/dev/sdb',
          detectionSource: 'cli',
        }],
      }],
      pvs: [],
      lvPaths: new Set(),
    })
    const vd = candidates.find(c => c.path === '/dev/sdb')
    expect(vd?.kind).toBe('hw_raid_ld')
    expect(vd?.eligible).toBe(true)
  })

  it('excludes protected system hardware RAID VD', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sda',
        path: '/dev/sda',
        type: 'disk',
        sizeBytes: 100 * 1024 ** 3,
        usedBy: ['hardware_raid'],
        esosSystemProtected: true,
        esosProtection: { protectedDevice: '/dev/sda', reasons: ['boot'] },
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC',
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
          id: '0/vd0',
          raidLevel: '1',
          sizeBytes: 100 * 1024 ** 3,
          state: 'optimal',
          devicePath: '/dev/sda',
          detectionSource: 'cli',
        }],
      }],
      pvs: [],
      lvPaths: new Set(),
    })
    const vd = candidates.find(c => c.path === '/dev/sda')
    expect(vd?.kind).toBe('hw_raid_ld')
    expect(vd?.eligible).toBe(false)
    expect(vd?.reasons.some(r => r.includes('système ESOS') || r.includes('system'))).toBe(true)
  })

  it('lists unmapped VD with diagnostic path', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC',
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
          id: '0/vd1',
          raidLevel: '1',
          sizeBytes: 223 * 1024 ** 3,
          state: 'optimal',
          devicePath: '',
          detectionSource: 'cli',
        }],
      }],
      pvs: [],
      lvPaths: new Set(),
      tools: {
        mdadm: true,
        lspci: true,
        storcli: false,
        perccli: true,
        MegaCli64: false,
        arcconf: false,
        lsscsi: true,
        wipefs: true,
        parted: true,
        sfdisk: true,
        fdisk: true,
        partprobe: true,
        udevadm: true,
      },
    })
    const unmapped = candidates.find(c => c.path === 'hw:0/0/vd1')
    expect(unmapped?.kind).toBe('hw_raid_ld')
    expect(unmapped?.eligible).toBe(false)
    expect(unmapped?.reasons[0]).toBe('storage.fs.hw_ld.mapping_not_found')
  })

  it('skips hardware RAID path already used as PV', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [{
        name: 'sdb',
        path: '/dev/sdb',
        type: 'disk',
        sizeBytes: 223 * 1024 ** 3,
        usedBy: ['hardware_raid'],
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        warnings: [],
      }],
      hardwareControllers: [{
        id: '0',
        vendor: 'dell_perc',
        model: 'PERC',
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
          id: '0/vd1',
          raidLevel: '1',
          sizeBytes: 223 * 1024 ** 3,
          state: 'optimal',
          devicePath: '/dev/sdb',
          detectionSource: 'cli',
        }],
      }],
      pvs: [{ path: '/dev/sdb', vgName: 'vg0', sizeBytes: 1, freeBytes: 1, uuid: 'u', usedBy: [] }],
      lvPaths: new Set(),
    })
    expect(candidates.find(c => c.path === '/dev/sdb')).toBeUndefined()
  })

  it('skips md0 already used as PV', () => {
    const candidates = buildLvmCandidatesFromInventory({
      blockDevices: [],
      mdArrays: [mdArray()],
      pvs: [{ path: '/dev/md0', vgName: '', sizeBytes: 1, freeBytes: 1, uuid: 'x', usedBy: [] }],
      lvPaths: new Set(),
    })
    expect(candidates.find(c => c.path === '/dev/md0')).toBeUndefined()
  })
})
