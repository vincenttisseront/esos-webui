import { describe, expect, it, vi } from 'vitest'
import { buildStorCliCreateLd } from '../server/utils/raid-hardware'
import {
  buildStorCliControllerRefreshCommand,
  executeHwLogicalDriveCreate,
  hwLdDriveSlotKey,
  isStorCliExecFailure,
  parseShellExecOutput,
  parseStorCliCreatedVdId,
  validateHwCreateDriveSelection,
  verifyHwLogicalDriveCreated,
} from '../server/utils/raid-hw-ld-create'
import type { HardwareRaidController } from '../server/utils/raid-types'

function mockController(overrides: Partial<HardwareRaidController> = {}): HardwareRaidController {
  return {
    id: '0',
    vendor: 'dell_perc',
    model: 'PERC H730',
    cliTool: 'perccli',
    cliPath: '/opt/MegaRAID/perccli/perccli64',
    detectionSource: ['cli'],
    managementMode: 'full',
    health: 'ok',
    supportsCreate: true,
    supportsDelete: true,
    supportsHotSpare: true,
    physicalDrives: [
      {
        controllerId: '0',
        enclosure: '252',
        slot: '2',
        state: 'unconfigured_good',
        sizeBytes: 1e12,
        mediaType: 'HDD',
        model: 'DISK1',
        interfaceType: 'SAS',
        eligible: true,
        warnings: [],
      },
      {
        controllerId: '0',
        enclosure: '252',
        slot: '3',
        state: 'unconfigured_good',
        sizeBytes: 1e12,
        mediaType: 'HDD',
        model: 'DISK2',
        interfaceType: 'SAS',
        eligible: true,
        warnings: [],
      },
    ],
    logicalDrives: [{ controllerId: '0', id: '0/vd0', raidLevel: '1', sizeBytes: 1e12, state: 'optimal' }],
    warnings: [],
    ...overrides,
  } as HardwareRaidController
}

describe('raid-hw-ld-create', () => {
  it('buildStorCliCreateLd RAID1 selected slots (perccli r1 minimal)', () => {
    const cmd = buildStorCliCreateLd('perccli64', '0', '1', [
      { enclosure: '252', slot: '2' },
      { enclosure: '252', slot: '3' },
    ], 'WT', 'NORA', 'perccli')
    expect(cmd).toContain('drives=252:2,252:3')
    expect(cmd).toContain(' add vd r1 ')
    expect(cmd).not.toContain('adra')
    expect(cmd).not.toContain('type=raid')
  })

  it('isStorCliExecFailure treats syntax error as failure even with exit 0', () => {
    expect(isStorCliExecFailure('syntax error, unexpected TOKEN_UNKNOWN\nEXIT_CODE=0')).toBe(true)
  })

  it('buildStorCliControllerRefreshCommand uses vall show all J', () => {
    expect(buildStorCliControllerRefreshCommand('perccli64', '0')).toBe('perccli64 /c0/vall show all J')
  })

  it('isStorCliExecFailure detects non-zero exit and Status Failure', () => {
    expect(isStorCliExecFailure('Status = Failure\nEXIT_CODE=0')).toBe(true)
    expect(isStorCliExecFailure('VD created\nEXIT_CODE=1')).toBe(true)
    expect(isStorCliExecFailure('VD created\nEXIT_CODE=0')).toBe(false)
  })

  it('parseStorCliCreatedVdId extracts VD number', () => {
    expect(parseStorCliCreatedVdId('Controller = 0\nVD=2\nStatus = Success')).toBe('2')
  })

  it('validateHwCreateDriveSelection rejects non-ugood disks', () => {
    const ctrl = mockController({
      physicalDrives: [{
        controllerId: '0',
        enclosure: '252',
        slot: '0',
        state: 'online',
        sizeBytes: 1e12,
        mediaType: 'HDD',
        model: 'DISK',
        interfaceType: 'SAS',
        eligible: false,
        warnings: [],
      }],
    })
    expect(() => validateHwCreateDriveSelection(ctrl, [{ enclosure: '252', slot: '0' }])).toThrow()
  })

  it('verifyHwLogicalDriveCreated detects new logical drive', () => {
    const before = [{ controllerId: '0', id: '0/vd0', raidLevel: '1', sizeBytes: 1, state: 'optimal' }]
    const after = [
      ...before,
      { controllerId: '0', id: '0/vd1', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
    ]
    const result = verifyHwLogicalDriveCreated(before as any, after as any, '1', '0', '1')
    expect(result.verified).toBe(true)
    expect(result.createdVirtualDriveId).toBe('0/vd1')
  })

  it('executeHwLogicalDriveCreate throws on perccli syntax error with exit 0', async () => {
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: 'syntax error, unexpected TOKEN_UNKNOWN\nEXIT_CODE=0' }),
    }
    const ctrl = mockController()
    await expect(executeHwLogicalDriveCreate(
      manager as any,
      'raid-overview-test',
      ctrl,
      {
        controllerId: '0',
        raidLevel: '1',
        drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
        sizeMode: 'max',
        readPolicy: 'NORA',
        writePolicy: 'WT',
        confirmation: 'CREATE LD 1',
      },
    )).rejects.toMatchObject({ statusCode: 500 })
  })

  it('executeHwLogicalDriveCreate throws on perccli failure', async () => {
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: 'Status = Failure\nEXIT_CODE=0' }),
    }
    const ctrl = mockController()
    await expect(executeHwLogicalDriveCreate(
      manager as any,
      'raid-overview-test',
      ctrl,
      {
        controllerId: '0',
        raidLevel: '1',
        drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
        sizeMode: 'max',
        readPolicy: 'NORA',
        writePolicy: 'WT',
        confirmation: 'CREATE LD 1',
      },
    )).rejects.toMatchObject({ statusCode: 500 })
  })

  it('executeHwLogicalDriveCreate verifies created VD after refresh', async () => {
    const createStdout = 'VD=1\nStatus = Success\nEXIT_CODE=0'
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: createStdout })
        .mockResolvedValueOnce({ stdout: '{}\nEXIT_CODE=0' })
        .mockResolvedValueOnce({ stdout: 'EXIT_CODE=0' }),
    }

    const overviewModule = await import('../server/utils/raid-overview.service')
    const collectSpy = vi.spyOn(overviewModule, 'collectRaidOverview').mockResolvedValue({
      tools: {} as any,
      hardwareControllers: [mockController({
        logicalDrives: [
          { controllerId: '0', id: '0/vd0', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
          { controllerId: '0', id: '0/vd1', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
        ],
      })],
      mdArrays: [],
      stoppedMdArrays: [],
      blockDevices: [],
      scannedAt: Date.now(),
      alerts: [],
    } as any)

    const ctrl = mockController()
    const result = await executeHwLogicalDriveCreate(
      manager as any,
      'raid-overview-test',
      ctrl,
      {
        controllerId: '0',
        raidLevel: '1',
        drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
        sizeMode: 'max',
        readPolicy: 'NORA',
        writePolicy: 'WT',
        confirmation: 'CREATE LD 1',
      },
    )

    collectSpy.mockRestore()
    expect(result.ok).toBe(true)
    expect(result.warning).toBe(false)
    expect(result.createdVirtualDriveId).toBe('0/vd1')
    expect(hwLdDriveSlotKey({ enclosure: '252', slot: '2' })).toBe('252:2')
    expect(parseShellExecOutput(createStdout).exitCode).toBe(0)
  })

  it('sets backendStatus pending when OS path remains missing', async () => {
    const createStdout = 'VD=1\nStatus = Success\nEXIT_CODE=0'
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: createStdout })
        .mockResolvedValueOnce({ stdout: '{}\nEXIT_CODE=0' })
        .mockResolvedValueOnce({ stdout: 'EXIT_CODE=0' }),
    }
    const overviewModule = await import('../server/utils/raid-overview.service')
    const collectSpy = vi.spyOn(overviewModule, 'collectRaidOverview').mockResolvedValue({
      tools: {} as any,
      hardwareControllers: [mockController({
        logicalDrives: [
          { controllerId: '0', id: '0/vd0', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
          { controllerId: '0', id: '0/vd1', raidLevel: '1', sizeBytes: 1, state: 'optimal', devicePath: '' },
        ],
      })],
      mdArrays: [],
      stoppedMdArrays: [],
      blockDevices: [],
      scannedAt: Date.now(),
      alerts: [],
    } as any)
    const result = await executeHwLogicalDriveCreate(
      manager as any,
      'raid-overview-test',
      mockController(),
      {
        controllerId: '0',
        raidLevel: '1',
        drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
        sizeMode: 'max',
        readPolicy: 'NORA',
        writePolicy: 'WT',
        confirmation: 'CREATE LD 1',
      },
    )
    collectSpy.mockRestore()
    expect(result.createdVirtualDriveId).toBe('0/vd1')
    expect(result.backendStatus?.controllerDetected).toBe(true)
    expect(result.backendStatus?.osDeviceDetected).toBe(false)
    expect(result.backendStatus?.pendingRescan).toBe(true)
  })

  it('executeHwLogicalDriveCreate succeeds when post-create name fails', async () => {
    const createStdout = 'VD=2\nStatus = Success\nEXIT_CODE=0'
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: createStdout })
        .mockResolvedValueOnce({ stdout: '{}\nEXIT_CODE=0' })
        .mockResolvedValueOnce({ stdout: 'EXIT_CODE=0' })
        .mockResolvedValueOnce({ stdout: 'syntax error\nEXIT_CODE=0' }),
    }

    const overviewModule = await import('../server/utils/raid-overview.service')
    const collectSpy = vi.spyOn(overviewModule, 'collectRaidOverview').mockResolvedValue({
      tools: {} as any,
      hardwareControllers: [mockController({
        logicalDrives: [
          { controllerId: '0', id: '0/vd0', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
          { controllerId: '0', id: '0/vd2', raidLevel: '1', sizeBytes: 1, state: 'optimal' },
        ],
      })],
      mdArrays: [],
      stoppedMdArrays: [],
      blockDevices: [],
      scannedAt: Date.now(),
      alerts: [],
    } as any)

    const ctrl = mockController()
    const result = await executeHwLogicalDriveCreate(
      manager as any,
      'raid-overview-test',
      ctrl,
      {
        controllerId: '0',
        raidLevel: '1',
        drives: [{ enclosure: '252', slot: '2' }, { enclosure: '252', slot: '3' }],
        sizeMode: 'max',
        readPolicy: 'NORA',
        writePolicy: 'WT',
        confirmation: 'CREATE LD 1',
        name: 'test',
      },
    )

    collectSpy.mockRestore()
    expect(result.ok).toBe(true)
    expect(result.warning).toBe(true)
    expect(result.command).not.toContain('name=')
    expect(result.nameWarning).toBeTruthy()
    expect(result.nameApplyCommand).toContain('set name=test')
  })
})
