import { describe, expect, it } from 'vitest'
import { buildLvmCandidatesFromInventory } from '../server/utils/lvm-candidates'
import { buildFsBackendsAndLinks } from '../server/utils/fs-inventory-resolver'
import {
  applyHardwareRaidMdRestrictions,
  evaluateHwBackendEligibility,
  markBlockDevicesFromHardwareRaid,
} from '../utils/hw-raid-backend-eligibility'
import type { HardwareRaidController, RaidBlockDevice } from '../server/utils/raid-types'

function hwBlockDev(overrides: Partial<RaidBlockDevice> = {}): RaidBlockDevice {
  return {
    name: 'sdb',
    path: '/dev/sdb',
    type: 'disk',
    sizeBytes: 223 * 1024 ** 3,
    model: 'PERC H730P Mini',
    vendor: 'DELL',
    usedBy: [],
    mdEligibilityReasons: ['Seules les partitions existantes sont éligibles'],
    eligibleForMdPartitionPrep: true,
    mdPartitionPrepReasons: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: false,
    warnings: [],
    ...overrides,
  }
}

function controllerWithVd(osPath: string, vdId = '0/vd1'): HardwareRaidController {
  return {
    id: '0',
    vendor: 'dell_perc',
    model: 'PERC H730P',
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
      id: vdId,
      raidLevel: '1',
      sizeBytes: 223 * 1024 ** 3,
      state: 'optimal',
      devicePath: osPath,
      detectionSource: 'cli',
    }],
  }
}

describe('hw-raid-backend-eligibility', () => {
  it('marks mapped OS path as hardware_raid and blocks MD prep', () => {
    const controllers = [controllerWithVd('/dev/sdb')]
    const devices = [hwBlockDev()]
    applyHardwareRaidMdRestrictions(controllers, devices)
    expect(devices[0].usedBy).toContain('hardware_raid')
    expect(devices[0].eligibleForMdPartitionPrep).toBe(false)
    expect(devices[0].mdPartitionPrepReasons.some(r => r.includes('RAID matériel'))).toBe(true)
  })

  it('classifies clean hardware VD as LVM and FILEIO candidate', () => {
    const dev = hwBlockDev({ usedBy: ['hardware_raid'] })
    const eligibility = evaluateHwBackendEligibility(dev, controllerWithVd('/dev/sdb').logicalDrives[0])
    expect(eligibility.lvmEligible).toBe(true)
    expect(eligibility.fileioEligible).toBe(true)

    const lvmCandidates = buildLvmCandidatesFromInventory({
      blockDevices: [dev],
      hardwareControllers: [controllerWithVd('/dev/sdb')],
      pvs: [],
      lvPaths: new Set(),
    })
    const cand = lvmCandidates.find(c => c.path === '/dev/sdb')
    expect(cand?.kind).toBe('hw_raid_ld')
    expect(cand?.eligible).toBe(true)

    const { backends } = buildFsBackendsAndLinks({
      raid: {
        blockDevices: [dev],
        hardwareControllers: [controllerWithVd('/dev/sdb')],
        mdArrays: [],
        tools: { mdadm: true, lspci: true, storcli: false, perccli: true, MegaCli64: false, arcconf: false, lsscsi: true, wipefs: true, parted: true, sfdisk: true, fdisk: true, partprobe: true, udevadm: true },
      },
      lvm: { pvs: [], vgs: [], lvs: [] },
      mounts: [],
      pathToDevices: new Map(),
    })
    const fs = backends.find(b => b.path === '/dev/sdb' && b.kind === 'hw_raid_ld')
    expect(fs?.eligible).toBe(true)
  })

  it('excludes system-protected hardware VD from backends', () => {
    const dev = hwBlockDev({
      usedBy: ['hardware_raid'],
      esosSystemProtected: true,
      esosProtection: {
        protected: true,
        protectedDevice: '/dev/sdb',
        reasons: [{ code: 'esos_label', message: 'ESOS system' }],
        labelsFound: ['ESOS-BOOT'],
        mountedPaths: [],
        relatedBlockPaths: ['/dev/sdb'],
      },
    })
    const eligibility = evaluateHwBackendEligibility(dev)
    expect(eligibility.lvmEligible).toBe(false)
    expect(eligibility.reasons.some(r => r.includes('système ESOS'))).toBe(true)
  })

  it('excludes used hardware VD (mounted / scst)', () => {
    const mounted = evaluateHwBackendEligibility(hwBlockDev({
      usedBy: ['hardware_raid', 'mounted'],
      mountpoint: '/mnt/data',
    }))
    expect(mounted.lvmEligible).toBe(false)

    const scst = evaluateHwBackendEligibility(hwBlockDev({
      usedBy: ['hardware_raid', 'scst'],
    }))
    expect(scst.lvmEligible).toBe(false)
  })

  it('marks block device usedBy via markBlockDevicesFromHardwareRaid', () => {
    const devices = [hwBlockDev({ usedBy: [] })]
    markBlockDevicesFromHardwareRaid([controllerWithVd('/dev/sdb')], devices)
    expect(devices[0].hwRaidLdId).toBe('0/vd1')
    expect(devices[0].usedBy).toContain('hardware_raid')
  })
})
