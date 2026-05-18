import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  pickLocale,
  SUPPORTED_LOCALES,
} from '../server/utils/locale'

describe('isSupportedLocale', () => {
  it('accepts every code declared in SUPPORTED_LOCALES', () => {
    for (const code of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(code)).toBe(true)
    }
  })

  it('rejects unknown / malformed values', () => {
    expect(isSupportedLocale('de')).toBe(false)
    expect(isSupportedLocale('')).toBe(false)
    expect(isSupportedLocale(null)).toBe(false)
    expect(isSupportedLocale(undefined)).toBe(false)
    expect(isSupportedLocale(42)).toBe(false)
    expect(isSupportedLocale('FR')).toBe(false)
  })
})

describe('pickLocale', () => {
  it('uses the user preference when supported (highest priority)', () => {
    expect(pickLocale('en', 'fr')).toBe('en')
    expect(pickLocale('fr', 'en')).toBe('fr')
  })

  it('falls back to the cookie when the user preference is null/unsupported', () => {
    expect(pickLocale(null, 'en')).toBe('en')
    expect(pickLocale(undefined, 'en')).toBe('en')
    expect(pickLocale('xx', 'en')).toBe('en')
  })

  it('falls back to the default locale when neither preference nor cookie is set', () => {
    expect(pickLocale(null, null)).toBe(DEFAULT_LOCALE)
    expect(pickLocale(undefined, undefined)).toBe(DEFAULT_LOCALE)
    expect(pickLocale('xx', 'zz')).toBe(DEFAULT_LOCALE)
  })

  it('defaults to French', () => {
    expect(DEFAULT_LOCALE).toBe('fr')
  })
})
