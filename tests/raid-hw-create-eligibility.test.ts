import { describe, expect, it } from 'vitest'
import {
  extractRaidCliFromToolsOutput,
  isRaidCliPath,
  toolsOutputHasRaidCli,
} from '../utils/raid-cli-path'
import {
  assessHwRaidCreateEligibility,
  countFreeHwRaidDisks,
} from '../utils/raid-hw-create-eligibility'
import type { HardwareRaidController } from '../types/raid'

function baseController(overrides: Partial<HardwareRaidController> = {}): HardwareRaidController {
  return {
    id: '0',
    vendor: 'dell_perc',
    model: 'PERC H710 Mini',
    cliTool: 'perccli',
    cliPath: '/opt/MegaRAID/perccli/perccli64',
    detectionSource: ['cli'],
    managementMode: 'full',
    health: 'ok',
    supportsCreate: true,
    supportsDelete: true,
    supportsHotSpare: true,
    physicalDrives: [],
    logicalDrives: [],
    warnings: [],
    ...overrides,
  }
}

describe('raid-cli-path', () => {
  it('detects perccli path case-insensitively in tools output', () => {
    const out = [
      '===TOOLS===',
      '/Opt/MegaRAID/Perccli/Perccli64',
    ].join('\n')
    expect(toolsOutputHasRaidCli(out)).toEqual({ perccli: true, storcli: false })
    expect(extractRaidCliFromToolsOutput(out)).toBe('/Opt/MegaRAID/Perccli/Perccli64')
    expect(isRaidCliPath('/Opt/MegaRAID/Perccli/Perccli64')).toBe(true)
  })

  it('normalizes basename check for mixed-case paths', () => {
    expect(isRaidCliPath('/usr/local/sbin/perccli64')).toBe(true)
    expect(isRaidCliPath('/opt/MegaRAID/storcli/storcli64')).toBe(true)
  })
})

describe('raid-hw-create-eligibility', () => {
  it('eligible controller with normalized perccli path and free disks', () => {
    const ctrl = baseController({
      cliPath: '/Opt/MegaRAID/Perccli/Perccli64',
      physicalDrives: [{
        controllerId: '0',
        slot: '0',
        state: 'unconfigured_good',
        sizeBytes: 1e12,
        eligible: true,
        warnings: [],
      }],
    })
    expect(countFreeHwRaidDisks(ctrl)).toBe(1)
    const e = assessHwRaidCreateEligibility(ctrl)
    expect(e.eligible).toBe(true)
    expect(e.reasons).toEqual([])
    expect(e.freeDiskCount).toBe(1)
  })

  it('excludes controller when CLI missing', () => {
    const ctrl = baseController({
      cliTool: 'none',
      cliPath: undefined,
      managementMode: 'read_only_limited',
      supportsCreate: false,
    })
    const e = assessHwRaidCreateEligibility(ctrl)
    expect(e.eligible).toBe(false)
    expect(e.reasons).toContain('cli_missing')
    expect(e.reasons).toContain('read_only_limited')
  })

  it('excludes controller with no free disks', () => {
    const ctrl = baseController({
      physicalDrives: [{
        controllerId: '0',
        slot: '0',
        state: 'online',
        sizeBytes: 1e12,
        eligible: false,
        warnings: [],
      }],
      supportsCreate: false,
    })
    const e = assessHwRaidCreateEligibility(ctrl)
    expect(e.eligible).toBe(false)
    expect(e.reasons).toContain('no_free_disks')
    expect(e.freeDiskCount).toBe(0)
  })

  it('wizard eligibility: full controller with supportsCreate and free disks is eligible', () => {
    const ctrl = baseController({
      model: 'PERC H710 Mini',
      physicalDrives: [
        { controllerId: '0', slot: '0', state: 'unconfigured_good', sizeBytes: 500e9, eligible: true, warnings: [] },
        { controllerId: '0', slot: '1', state: 'online', sizeBytes: 500e9, eligible: false, warnings: [] },
      ],
      logicalDrives: [{ controllerId: '0', id: '0/vd0', raidLevel: '1', state: 'optimal' }],
    })
    const e = assessHwRaidCreateEligibility(ctrl)
    expect(e.eligible).toBe(true)
    expect(e.physicalDiskCount).toBe(2)
    expect(e.logicalDriveCount).toBe(1)
  })
})
