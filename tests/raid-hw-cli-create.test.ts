import { describe, expect, it, vi } from 'vitest'
import {
  buildHwCliCreateLd,
  buildPerccliCreateLd,
  buildPerccliSetVdNameCommand,
  HW_VD_NAME_MAX_LENGTH,
  isRaidCliSyntaxError,
  mapRaidLevelToPerccliRx,
  parseHardwareLdIdToVdIndex,
  normalizeHardwareLdRouteId,
  expectedDeleteHwLdConfirmation,
  buildHwDeleteLdCommand,
  hardwareLdIdsMatch,
  resolveHwVdNameForCommand,
  supportsHwVdNameOnCreate,
  supportsHwVdNameOption,
  supportsHwVdNamePostCreate,
  validateHwVdName,
} from '../utils/raid-hw-cli-create'
import {
  resolveValidatedHwVdName,
  tryApplyHwVdNameAfterCreate,
} from '../server/utils/raid-hw-ld-create'
import { buildStorCliCreateLd } from '../server/utils/raid-hardware'
import { isStorCliExecFailure } from '../server/utils/raid-hw-ld-create'
import type { HardwareRaidController } from '../server/utils/raid-types'

describe('raid-hw-cli-create', () => {
  it('mapRaidLevelToPerccliRx maps RAID levels to rX tokens', () => {
    expect(mapRaidLevelToPerccliRx('1')).toBe('r1')
    expect(mapRaidLevelToPerccliRx('5')).toBe('r5')
    expect(mapRaidLevelToPerccliRx('6')).toBe('r6')
    expect(mapRaidLevelToPerccliRx('10')).toBe('r10')
  })

  it('buildPerccliCreateLd emits minimal RAID1 command without adra', () => {
    const cmd = buildPerccliCreateLd({
      cli: '/opt/MegaRAID/perccli/perccli64',
      ctrlIndex: '0',
      raidLevel: '1',
      drives: [{ enclosure: '32', slot: '6' }, { enclosure: '32', slot: '7' }],
      writePolicy: 'WT',
      readPolicy: 'ADRA',
    })
    expect(cmd).toBe(
      '/opt/MegaRAID/perccli/perccli64 /c0 add vd r1 drives=32:6,32:7',
    )
    expect(cmd).not.toMatch(/\badra\b/i)
    expect(cmd).not.toContain('type=')
  })

  it('buildHwCliCreateLd uses storcli type= syntax with cache policies', () => {
    const cmd = buildHwCliCreateLd({
      cli: 'storcli64',
      ctrlIndex: '0',
      raidLevel: '5',
      drives: [{ enclosure: '252', slot: '0' }],
      writePolicy: 'WT',
      readPolicy: 'ADRA',
      flavor: 'storcli',
    })
    expect(cmd).toContain('type=raid5')
    expect(cmd).toContain('adra')
  })

  it('isRaidCliSyntaxError detects TOKEN_UNKNOWN with exit code 0 output', () => {
    const out = 'syntax error, unexpected TOKEN_UNKNOWN\nEXIT_CODE=0'
    expect(isRaidCliSyntaxError(out)).toBe(true)
    expect(isStorCliExecFailure(out)).toBe(true)
  })

  it('validateHwVdName allows empty name', () => {
    expect(validateHwVdName('', 'perccli')).toEqual({ ok: true, name: '' })
    expect(validateHwVdName('   ', 'perccli')).toEqual({ ok: true, name: '' })
  })

  it('validateHwVdName rejects invalid characters and spaces', () => {
    expect(validateHwVdName('bad name', 'perccli').ok).toBe(false)
    expect(validateHwVdName('vol@1', 'perccli').ok).toBe(false)
    expect(validateHwVdName('ok_name-1.2', 'perccli')).toEqual({ ok: true, name: 'ok_name-1.2' })
  })

  it('validateHwVdName enforces perccli 15 char limit', () => {
    const long = 'a'.repeat(HW_VD_NAME_MAX_LENGTH.perccli + 1)
    expect(validateHwVdName(long, 'perccli')).toEqual({ ok: false, error: 'too_long' })
  })

  it('buildPerccliCreateLd omits name when empty', () => {
    const cmd = buildPerccliCreateLd({
      cli: 'perccli64',
      ctrlIndex: '0',
      raidLevel: '1',
      drives: [{ enclosure: '32', slot: '6' }],
      volumeName: '',
    })
    expect(cmd).not.toContain('name=')
  })

  it('buildPerccliCreateLd never includes name= on create even when volumeName set', () => {
    const cmd = buildPerccliCreateLd({
      cli: 'perccli64',
      ctrlIndex: '0',
      raidLevel: '1',
      drives: [{ enclosure: '32', slot: '6' }, { enclosure: '32', slot: '7' }],
      volumeName: 'test',
    })
    expect(cmd).not.toContain('name=')
    expect(supportsHwVdNameOnCreate('perccli')).toBe(false)
    expect(supportsHwVdNamePostCreate('perccli')).toBe(true)
    expect(resolveHwVdNameForCommand('test', 'perccli')).toBe('test')
  })

  it('buildPerccliSetVdNameCommand is separate from create', () => {
    expect(buildPerccliSetVdNameCommand('perccli64', '0', '1', 'test')).toBe(
      'perccli64 /c0/v1 set name=test',
    )
    expect(parseHardwareLdIdToVdIndex('0/vd1')).toBe('1')
  })

  it('normalizes encoded LD route id and builds delete command', () => {
    expect(normalizeHardwareLdRouteId('0%2Fvd1')).toBe('0/vd1')
    expect(expectedDeleteHwLdConfirmation('0%2Fvd1')).toBe('DELETE LD 0/vd1')
    expect(hardwareLdIdsMatch('0/vd1', '0%2Fvd1')).toBe(true)
    expect(buildHwDeleteLdCommand({
      cliTool: 'perccli',
      cliPath: 'perccli64',
      controllerId: '0',
      ldId: '0/vd1',
    })).toBe('perccli64 /c0/v1 del force')
  })

  it('buildPerccliCreateLd ignores invalid name token', () => {
    const cmd = buildPerccliCreateLd({
      cli: 'perccli64',
      ctrlIndex: '0',
      raidLevel: '1',
      drives: [{ enclosure: '32', slot: '6' }],
      volumeName: 'bad name',
    })
    expect(cmd).not.toContain('name=')
  })

  it('resolveValidatedHwVdName rejects invalid name on server', () => {
    expect(() => resolveValidatedHwVdName('x y', 'perccli')).toThrow()
    expect(resolveValidatedHwVdName(undefined, 'perccli')).toBeUndefined()
    expect(resolveValidatedHwVdName('esos-vol', 'perccli')).toBe('esos-vol')
  })

  it('name apply failure does not throw from tryApplyHwVdNameAfterCreate', async () => {
    const manager = {
      exec: vi.fn().mockResolvedValue({ stdout: 'syntax error\nEXIT_CODE=0' }),
    }
    const ctrl = {
      id: '0',
      cliTool: 'perccli',
      cliPath: 'perccli64',
    } as HardwareRaidController
    const result = await tryApplyHwVdNameAfterCreate(manager as any, ctrl, '0/vd2', 'test')
    expect(result.applied).toBe(false)
    expect(result.warning).toContain('nom')
    expect(result.command).toContain('set name=test')
  })

  it('buildStorCliCreateLd wrapper matches perccli vs storcli flavors', () => {
    const perc = buildStorCliCreateLd('perccli64', '0', '1', [
      { enclosure: '32', slot: '1' },
      { enclosure: '32', slot: '2' },
    ], 'WT', 'ADRA', 'perccli')
    expect(perc).toContain(' add vd r1 drives=32:1,32:2')

    const stor = buildStorCliCreateLd('storcli', '0', '1', [
      { enclosure: '252', slot: '1' },
      { enclosure: '252', slot: '2' },
    ], 'WT', 'ADRA', 'storcli')
    expect(stor).toContain('type=raid1')
  })
})
