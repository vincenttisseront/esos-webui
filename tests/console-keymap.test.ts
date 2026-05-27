import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildLoadkeysCommand,
  FALLBACK_CONSOLE_KEYMAPS,
  isKeymapAllowed,
  mergeKeymapLists,
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
    const cmd = buildLoadkeysCommand('fr-latin9')
    expect(cmd).toContain('loadkeys')
    expect(cmd).not.toContain('\n')
  })

  it('buildLoadkeysCommand uses resolved path when provided', () => {
    const path = '/usr/share/kbd/keymaps/i386/azerty/fr.map.gz'
    const cmd = buildLoadkeysCommand('fr', path)
    expect(cmd).toContain(path)
    expect(cmd).not.toContain('fr-latin9')
  })

  it('mergeKeymapLists unions detected, current, and fallback', () => {
    const detected = [{ id: 'dvorak', label: 'dvorak', source: 'detected' as const }]
    const { available, detectedCount, usingFallback } = mergeKeymapLists(detected, { id: 'fr' })
    expect(detectedCount).toBe(1)
    expect(usingFallback).toBe(true)
    expect(available.some(k => k.id === 'dvorak')).toBe(true)
    expect(available.some(k => k.id === 'fr')).toBe(true)
    for (const id of FALLBACK_CONSOLE_KEYMAPS) {
      expect(available.some(k => k.id === id)).toBe(true)
    }
  })

  it('mergeKeymapLists with empty detection uses full fallback', () => {
    const { available, detectedCount, usingFallback } = mergeKeymapLists([], null)
    expect(detectedCount).toBe(0)
    expect(usingFallback).toBe(true)
    expect(available.length).toBe(FALLBACK_CONSOLE_KEYMAPS.length)
  })

  it('isKeymapAllowed accepts fallback ids', () => {
    const { available, usingFallback, detectedCount } = mergeKeymapLists([], null)
    const info = {
      current: null,
      available,
      loadkeysPresent: true,
      rcKeymapPresent: false,
      usingFallback,
      detectedCount,
    }
    expect(isKeymapAllowed('fr', info)).toBe(true)
    expect(isKeymapAllowed('invalid;id', info)).toBe(false)
  })
})
