import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildLoadkeysCommand,
  normalizeKeymapId,
  parseRcKeymap,
  serializeRcKeymap,
  validateKeymapId,
} from '../server/utils/console-keymap'

const FIX = join(__dirname, 'fixtures/rc-keymap')

describe('console-keymap', () => {
  it('normalizes keymap ids from filenames', () => {
    expect(normalizeKeymapId('fr-latin9')).toBe('fr-latin9')
    expect(normalizeKeymapId('/usr/share/kbd/keymaps/x/y/fr.map.gz')).toBe('fr')
    expect(normalizeKeymapId('us.map')).toBe('us')
  })

  it('validates keymap id safely', () => {
    expect(validateKeymapId('fr-latin9')).toBeNull()
    expect(validateKeymapId('us')).toBeNull()
    expect(validateKeymapId('../us')).not.toBeNull()
    expect(validateKeymapId('fr;rm -rf /')).not.toBeNull()
  })

  it('parses rc.keymap and picks last loadkeys', () => {
    const content = [
      '# comment',
      'loadkeys us',
      'loadkeys /usr/share/kbd/keymaps/i386/azerty/fr-latin9.map.gz',
      '',
    ].join('\n')
    expect(parseRcKeymap(content)).toEqual({ id: 'fr-latin9' })
  })

  it('parses slackware-style rc.keymap fixture', () => {
    const raw = readFileSync(join(FIX, 'slackware-default.sh'), 'utf-8')
    expect(parseRcKeymap(raw)).toEqual({ id: 'us' })
  })

  it('parses path-arg rc.keymap fixture', () => {
    const raw = readFileSync(join(FIX, 'path-arg.sh'), 'utf-8')
    expect(parseRcKeymap(raw)).toEqual({ id: 'fr-latin9' })
  })

  it('serializes rc.keymap and builds safe loadkeys command', () => {
    const script = serializeRcKeymap('fr-latin9')
    expect(script).toContain('loadkeys')
    const cmd = buildLoadkeysCommand("fr-latin9")
    expect(cmd).toContain('loadkeys')
    expect(cmd).not.toContain('\n')
  })
})

