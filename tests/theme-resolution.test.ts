import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THEME,
  isSupportedTheme,
  pickTheme,
  SUPPORTED_THEMES,
} from '../server/utils/theme'

describe('isSupportedTheme', () => {
  it('accepts every code declared in SUPPORTED_THEMES', () => {
    for (const code of SUPPORTED_THEMES) {
      expect(isSupportedTheme(code)).toBe(true)
    }
  })

  it('rejects unknown / malformed values', () => {
    expect(isSupportedTheme('auto')).toBe(false)
    expect(isSupportedTheme('')).toBe(false)
    expect(isSupportedTheme(null)).toBe(false)
    expect(isSupportedTheme(undefined)).toBe(false)
    expect(isSupportedTheme(42)).toBe(false)
  })
})

describe('pickTheme', () => {
  it('uses the user preference when supported (highest priority)', () => {
    expect(pickTheme('dark', 'light')).toBe('dark')
    expect(pickTheme('light', 'dark')).toBe('light')
    expect(pickTheme('system', 'dark')).toBe('system')
  })

  it('falls back to the cookie when the user preference is null/unsupported', () => {
    expect(pickTheme(null, 'dark')).toBe('dark')
    expect(pickTheme(undefined, 'light')).toBe('light')
    expect(pickTheme('xx', 'system')).toBe('system')
  })

  it('falls back to the default theme when neither preference nor cookie is set', () => {
    expect(pickTheme(null, null)).toBe(DEFAULT_THEME)
    expect(pickTheme(undefined, undefined)).toBe(DEFAULT_THEME)
    expect(pickTheme('xx', 'zz')).toBe(DEFAULT_THEME)
  })

  it('defaults to system', () => {
    expect(DEFAULT_THEME).toBe('system')
  })
})
