import { describe, expect, it } from 'vitest'
import * as esosProtection from '../server/utils/esos-system-protection'
import {
  emptyEsosSystemProtection,
  normalizeEsosSystemProtection,
} from '../utils/esos-system-protection'
import type { HardwareRaidController, RaidBlockDevice } from '../server/utils/raid-types'

function part(path: string, label: string, parent: string): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes: 1e9,
    type: 'part',
    label,
    parent,
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
    usedBy: [],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

describe('raid overview systemProtection resilience', () => {
  it('normalizeEsosSystemProtection handles missing API field', () => {
    expect(normalizeEsosSystemProtection(undefined)).toEqual(emptyEsosSystemProtection())
    expect(normalizeEsosSystemProtection(null).protectedDevices).toEqual([])
    expect(normalizeEsosSystemProtection(null).warnings).toEqual([])
    expect(normalizeEsosSystemProtection(null).errors).toEqual([])
  })

  it('collectSystemProtectionForOverview returns consistent empty shape', () => {
    const result = esosProtection.collectSystemProtectionForOverview(
      { blockDevices: [], hardwareControllers: [] },
      {},
    )
    expect(result.protectedDevices).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.protectedBlockPaths).toEqual([])
  })

  it('collectSystemProtectionForOverview catches detection errors without throwing', () => {
    const brokenController = {
      id: '0',
      vendor: 'dell_perc',
      model: 'PERC',
      cliTool: 'perccli',
      detectionSource: ['cli'],
      managementMode: 'full',
      health: 'ok',
      supportsCreate: false,
      supportsDelete: true,
      supportsHotSpare: true,
      physicalDrives: [],
      logicalDrives: undefined,
      warnings: [],
    } as unknown as HardwareRaidController

    const result = esosProtection.collectSystemProtectionForOverview(
      { blockDevices: [], hardwareControllers: [brokenController] },
      {},
    )
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.protectedDevices).toEqual([])
  })

  it('protected /dev/sda from esos_root labels in overview apply', () => {
    const blockDevices = [disk('/dev/sda'), part('/dev/sda2', 'esos_root', 'sda')]
    const controllers: HardwareRaidController[] = []
    const snap = esosProtection.buildEsosSystemProtection({ blockDevices, hardwareControllers: controllers })
    expect(snap.protectedDevices.length).toBeGreaterThan(0)
    expect(snap.protectedDiskPaths).toContain('/dev/sda')

    esosProtection.applyEsosProtectionToOverview({ blockDevices, hardwareControllers: controllers })
    expect(blockDevices.find(d => d.path === '/dev/sda')?.esosSystemProtected).toBe(true)
  })
})
