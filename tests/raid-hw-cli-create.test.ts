import { describe, expect, it } from 'vitest'
import {
  buildHwCliCreateLd,
  buildPerccliCreateLd,
  HW_VD_NAME_MAX_LENGTH,
  isRaidCliSyntaxError,
  mapRaidLevelToPerccliRx,
  resolveHwVdNameForCommand,
  supportsHwVdNameOption,
  validateHwVdName,
} from '../utils/raid-hw-cli-create'
import { resolveValidatedHwVdName } from '../server/utils/raid-hw-ld-create'
import { buildStorCliCreateLd } from '../server/utils/raid-hardware'
import { isStorCliExecFailure } from '../server/utils/raid-hw-ld-create'

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

  it('buildPerccliCreateLd includes name= when valid and supported', () => {
    const cmd = buildPerccliCreateLd({
      cli: 'perccli64',
      ctrlIndex: '0',
      raidLevel: '1',
      drives: [{ enclosure: '32', slot: '6' }, { enclosure: '32', slot: '7' }],
      volumeName: 'esos-data-01',
    })
    expect(cmd).toContain(' name=esos-data-01')
    expect(supportsHwVdNameOption('perccli')).toBe(true)
    expect(resolveHwVdNameForCommand('esos-data-01', 'perccli')).toBe('esos-data-01')
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
