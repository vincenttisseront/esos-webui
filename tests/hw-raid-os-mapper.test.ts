import { describe, expect, it } from 'vitest'
import { parseLsscsi } from '../server/utils/raid-pci-detection'
import {
  enrichHardwareLdOsPaths,
  hasRaidCliTool,
  hwLdUnmappedReasonKey,
} from '../server/utils/hw-raid-os-mapper'
import { buildFsBackendsAndLinks } from '../server/utils/fs-inventory-resolver'
import type { HardwareRaidController, RaidBlockDevice, RaidToolsInfo } from '../server/utils/raid-types'

const LSSCSI_OUTPUT = [
  '[0:2:0:0]    disk    DELL     PERC H730P Mini  4.30  /dev/sda  /dev/sg0',
  '[0:2:1:0]    disk    DELL     PERC H730P Mini  4.30  /dev/sdb  /dev/sg1',
].join('\n')

const toolsWithPerccli: RaidToolsInfo = {
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
}

function blockDev(path: string, sizeBytes: number): RaidBlockDevice {
  return {
    name: path.replace('/dev/', ''),
    path,
    sizeBytes,
    type: 'disk',
    model: 'PERC H730P Mini',
    vendor: 'DELL',
    usedBy: ['hardware_raid'],
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: true,
    warnings: [],
  }
}

describe('hw-raid-os-mapper', () => {
  it('parses lsscsi disk tuple with block and sg paths', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const second = kernel.find(k => k.scsiAddress === '0:2:1:0')
    expect(second?.devicePath).toBe('/dev/sdb')
    expect(second?.sgDevicePath).toBe('/dev/sg1')
  })

  it('maps VDs from lsscsi when OS Drive Name is empty', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const controllers: HardwareRaidController[] = [{
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
      logicalDrives: [
        {
          controllerId: '0',
          id: '0/vd0',
          raidLevel: '1',
          sizeBytes: 1_000_000_000_000,
          state: 'optimal',
          devicePath: '',
          detectionSource: 'cli',
        },
        {
          controllerId: '0',
          id: '0/vd1',
          raidLevel: '1',
          sizeBytes: 2_000_000_000_000,
          state: 'optimal',
          devicePath: '',
          detectionSource: 'cli',
        },
      ],
      warnings: [],
    }]

    const blockDevices = [
      blockDev('/dev/sda', 1_000_000_000_000),
      blockDev('/dev/sdb', 2_000_000_000_000),
    ]

    const enriched = enrichHardwareLdOsPaths({
      controllers,
      blockDevices,
      kernelLogicalDrives: kernel,
      tools: toolsWithPerccli,
    })

    const paths = enriched[0].logicalDrives.map(ld => ld.devicePath).sort()
    expect(paths).toEqual(['/dev/sda', '/dev/sdb'])
    expect(enriched[0].logicalDrives.every(ld => ld.osMappingStatus === 'mapped')).toBe(true)
    const vd1 = enriched[0].logicalDrives.find(ld => ld.id === '0/vd1')
    expect(vd1?.devicePath).toBe('/dev/sdb')
    expect(vd1?.osDevicePath).toBe('/dev/sdb')
    expect(vd1?.osDeviceDetectionSource).toBe('lsscsi')
    expect(vd1?.osDeviceConfidence).toBe('high')
    expect(vd1?.osMappingDiagnostic?.mappingSource).toBe('lsscsi')
    expect(vd1?.osMappingDiagnostic?.mappedSgPath).toBe('/dev/sg1')
    expect(vd1?.osMappingDiagnostic?.mappedScsiTuple).toBe('0:2:1:0')
    expect(vd1?.osMappingDiagnostic?.confidence).toBe('high')
  })

  it('maps DG/VD-style id 1/vd1 to target 1 via lsscsi fallback', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const controllers: HardwareRaidController[] = [
      {
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
          sizeBytes: 223_000_000_000,
          state: 'optimal',
          devicePath: '',
          detectionSource: 'cli',
        }],
        warnings: [],
      },
      {
        id: '1',
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
        logicalDrives: [],
        warnings: [],
      },
    ]
    const blockDevices = [
      blockDev('/dev/sda', 278_900_000_000),
      blockDev('/dev/sdb', 223_000_000_000),
    ]

    const enriched = enrichHardwareLdOsPaths({
      controllers,
      blockDevices,
      kernelLogicalDrives: kernel,
      tools: toolsWithPerccli,
    })
    const mapped = enriched[0].logicalDrives[0]
    expect(mapped.devicePath).toBe('/dev/sdb')
    expect(mapped.osDevicePath).toBe('/dev/sdb')
    expect(mapped.osDeviceDetectionSource).toBe('lsscsi')
    expect(mapped.osMappingDiagnostic?.mappedScsiTuple).toBe('0:2:1:0')
    expect(mapped.osMappingDiagnostic?.mappingSource).toBe('lsscsi')
  })

  it('uses medium confidence when size is unavailable but target matches', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const controllers: HardwareRaidController[] = [{
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
        id: '0/vd1',
        raidLevel: '1',
        state: 'optimal',
        devicePath: '',
        detectionSource: 'cli',
      }],
      warnings: [],
    }]
    const blockDevices = [blockDev('/dev/sdb', 223_000_000_000)]
    const enriched = enrichHardwareLdOsPaths({
      controllers,
      blockDevices,
      kernelLogicalDrives: kernel,
      tools: toolsWithPerccli,
    })
    expect(enriched[0].logicalDrives[0].devicePath).toBe('/dev/sdb')
    expect(enriched[0].logicalDrives[0].osDeviceConfidence).toBe('medium')
    expect(enriched[0].logicalDrives[0].osMappingDiagnostic?.confidence).toBe('medium')
  })

  it('does not mark lsscsi mapping as high confidence on size mismatch', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const controllers: HardwareRaidController[] = [{
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
        id: '0/vd1',
        raidLevel: '1',
        sizeBytes: 99_000_000_000,
        state: 'optimal',
        devicePath: '',
        detectionSource: 'cli',
      }],
      warnings: [],
    }]

    const blockDevices = [
      blockDev('/dev/sda', 1_000_000_000_000),
      blockDev('/dev/sdb', 2_000_000_000_000),
    ]

    const enriched = enrichHardwareLdOsPaths({
      controllers,
      blockDevices,
      kernelLogicalDrives: kernel,
      tools: toolsWithPerccli,
    })
    expect(enriched[0].logicalDrives[0].devicePath ?? '').not.toBe('/dev/sdb')
    expect(enriched[0].logicalDrives[0].osMappingDiagnostic?.confidence).not.toBe('high')
    expect(enriched[0].logicalDrives[0].osMappingStatus).not.toBe('mapped')
  })

  it('distinguishes tool missing vs mapping not found', () => {
    expect(hwLdUnmappedReasonKey({ ...toolsWithPerccli, perccli: false, storcli: false })).toBe(
      'storage.fs.hw_ld.tool_missing',
    )
    expect(hwLdUnmappedReasonKey(toolsWithPerccli)).toBe('storage.fs.hw_ld.mapping_not_found')
    expect(hasRaidCliTool(toolsWithPerccli)).toBe(true)
  })
})

describe('fs backends with HW mapping', () => {
  it('uses real /dev path when mapper succeeded', () => {
    const kernel = parseLsscsi(LSSCSI_OUTPUT)
    const controllers: HardwareRaidController[] = [{
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
        sizeBytes: 1_000_000_000_000,
        state: 'optimal',
        devicePath: '/dev/sda',
        osMappingStatus: 'mapped',
      }],
      warnings: [],
    }]

    const { backends } = buildFsBackendsAndLinks({
      raid: {
        blockDevices: [blockDev('/dev/sda', 1_000_000_000_000)],
        hardwareControllers: enrichHardwareLdOsPaths({
          controllers,
          blockDevices: [blockDev('/dev/sda', 1_000_000_000_000)],
          kernelLogicalDrives: kernel,
          tools: toolsWithPerccli,
        }),
        mdArrays: [],
        tools: toolsWithPerccli,
      },
      lvm: { pvs: [], vgs: [], lvs: [] } as any,
      mounts: [],
      pathToDevices: new Map(),
      tools: toolsWithPerccli,
    })

    const hw = backends.find(b => b.kind === 'hw_raid_ld' && b.path === '/dev/sda')
    expect(hw).toBeDefined()
    expect(hw?.path).toBe('/dev/sda')
  })

  it('unmapped LD uses i18n key when perccli present', () => {
    const { backends } = buildFsBackendsAndLinks({
      raid: {
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
            id: '0/vd0',
            raidLevel: '1',
            sizeBytes: 999,
            state: 'optimal',
            osMappingStatus: 'unmapped',
          }],
          warnings: [],
        }],
        mdArrays: [],
        tools: toolsWithPerccli,
      },
      lvm: { pvs: [], vgs: [], lvs: [] } as any,
      mounts: [],
      pathToDevices: new Map(),
      tools: toolsWithPerccli,
    })

    const hw = backends.find(b => b.kind === 'hw_raid_ld')
    expect(hw).toBeDefined()
    expect(hw?.reasons).toContain('storage.fs.hw_ld.mapping_not_found')
    expect(hw?.eligible).toBe(false)
  })
})
