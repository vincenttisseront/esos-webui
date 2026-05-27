import { describe, expect, it } from 'vitest'
import {
  applyEsosProtectionToOverview,
  assertHardwareLdNotEsosProtected,
  buildEsosSystemProtection,
  findProtectionForHardwareLd,
} from '../server/utils/esos-system-protection'
import type { HardwareRaidController, RaidBlockDevice } from '../server/utils/raid-types'

function part(path: string, label: string, parent?: string): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 100e9,
    type: 'part',
    label,
    parent: parent ?? path.replace(/p?\d+$/, '').replace('/dev/', ''),
    usedBy: [],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

function disk(path: string): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 500e9,
    type: 'disk',
    usedBy: ['hardware_raid'],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

function ctrl(ld: HardwareRaidController['logicalDrives'][0]): HardwareRaidController {
  return {
    id: '0',
    vendor: 'dell_perc',
    model: 'PERC H710',
    cliTool: 'perccli',
    cliPath: '/opt/MegaRAID/perccli/perccli64',
    detectionSource: ['cli'],
    managementMode: 'full',
    health: 'ok',
    supportsCreate: false,
    supportsDelete: true,
    supportsHotSpare: true,
    physicalDrives: [],
    logicalDrives: [ld],
    warnings: [],
  }
}

describe('esos-system-protection', () => {
  it('esos_root on /dev/sda2 protects /dev/sda and hardware VD 0/vd0', () => {
    const blockDevices = [
      disk('/dev/sda'),
      part('/dev/sda2', 'esos_root', 'sda'),
      disk('/dev/sdb'),
      part('/dev/sdb1', 'data', 'sdb'),
    ]
    const controllers = [ctrl({
      controllerId: '0',
      id: '0/vd0',
      raidLevel: '1',
      state: 'optimal',
      devicePath: '/dev/sda',
    })]

    const snap = buildEsosSystemProtection({ blockDevices, hardwareControllers: controllers })
    expect(snap.protectedDiskPaths).toContain('/dev/sda')
    expect(snap.protectedHardwareLdIds).toContain('0/vd0')
    expect(snap.protectedDiskPaths).not.toContain('/dev/sdb')

    applyEsosProtectionToOverview({ blockDevices, hardwareControllers: controllers })
    expect(controllers[0].logicalDrives[0].esosSystemProtected).toBe(true)
    expect(findProtectionForHardwareLd('0/vd0', snap, controllers)?.protectedDevice).toBe('/dev/sda')
  })

  it('/dev/sdb without ESOS labels is not protected', () => {
    const blockDevices = [
      disk('/dev/sda'),
      part('/dev/sda2', 'esos_root', 'sda'),
      disk('/dev/sdb'),
      part('/dev/sdb1', 'userdata', 'sdb'),
    ]
    const snap = buildEsosSystemProtection({ blockDevices, hardwareControllers: [] })
    expect(snap.protectedDiskPaths).not.toContain('/dev/sdb')
    const sdb = blockDevices.find(d => d.path === '/dev/sdb')!
    applyEsosProtectionToOverview({ blockDevices, hardwareControllers: [] })
    expect(sdb.esosSystemProtected).toBeFalsy()
  })

  it('duplicate ESOS labels protect both parent disks', () => {
    const blockDevices = [
      disk('/dev/sda'),
      part('/dev/sda2', 'esos_root', 'sda'),
      disk('/dev/sdb'),
      part('/dev/sdb2', 'esos_root', 'sdb'),
    ]
    const snap = buildEsosSystemProtection({ blockDevices, hardwareControllers: [] })
    expect(snap.duplicateEsosLabels).toBe(true)
    expect(snap.protectedDiskPaths).toContain('/dev/sda')
    expect(snap.protectedDiskPaths).toContain('/dev/sdb')
    const reasons = snap.protectedDevices.flatMap(e => e.reasons.map(r => r.code))
    expect(reasons).toContain('duplicate_esos_label')
  })

  it('backend delete rejects protected VD with 403-shaped error', () => {
    const blockDevices = [
      disk('/dev/sda'),
      part('/dev/sda2', 'esos_root', 'sda'),
    ]
    const controllers = [ctrl({
      controllerId: '0',
      id: '0/vd0',
      raidLevel: '1',
      state: 'optimal',
      devicePath: '/dev/sda',
    })]
    const snap = buildEsosSystemProtection({ blockDevices, hardwareControllers: controllers })

    expect(() => assertHardwareLdNotEsosProtected('0/vd0', snap, controllers)).toThrowError(
      /Volume système ESOS protégé/,
    )
  })
})
