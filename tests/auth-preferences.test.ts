import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { enforceMutationAccess } from '../server/utils/api-rbac'
import { validatePreferencesPatch } from '../server/utils/auth-preferences'

function expectForbidden(fn: () => void) {
  expect(fn).toThrow()
}

describe('api-rbac — PATCH /api/auth/preferences', () => {
  it('allows viewer to PATCH own preferences', () => {
    expect(() =>
      enforceMutationAccess('/api/auth/preferences', 'PATCH', 'viewer'),
    ).not.toThrow()
  })

  it('allows operator to PATCH own preferences', () => {
    expect(() =>
      enforceMutationAccess('/api/auth/preferences', 'PATCH', 'operator'),
    ).not.toThrow()
  })

  it('allows admin to PATCH own preferences', () => {
    expect(() =>
      enforceMutationAccess('/api/auth/preferences', 'PATCH', 'admin'),
    ).not.toThrow()
  })

  it('denied before RBAC fix pattern — unknown auth mutation still blocked', () => {
    expectForbidden(() =>
      enforceMutationAccess('/api/auth/unknown-mutation', 'PATCH', 'admin'),
    )
  })
})

describe('PUBLIC_API_PREFIXES — preferences require auth', () => {
  const source = readFileSync(join(process.cwd(), 'server/middleware/auth.ts'), 'utf-8')

  it('does not whitelist /api/auth/preferences', () => {
    expect(source).not.toContain("'/api/auth/preferences'")
  })
})

describe('validatePreferencesPatch', () => {
  it('accepts fr locale and dark theme', () => {
    const r = validatePreferencesPatch({ preferredLocale: 'fr', preferredTheme: 'dark' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.patch.preferredLocale).toBe('fr')
      expect(r.patch.preferredTheme).toBe('dark')
    }
  })

  it('accepts system theme and null locale', () => {
    const r = validatePreferencesPatch({ preferredLocale: null, preferredTheme: 'system' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.patch.preferredLocale).toBeNull()
      expect(r.patch.preferredTheme).toBe('system')
    }
  })

  it('rejects unsupported locale', () => {
    const r = validatePreferencesPatch({ preferredLocale: 'de' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('auth.unsupported_locale')
    }
  })

  it('rejects unsupported theme', () => {
    const r = validatePreferencesPatch({ preferredTheme: 'auto' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('auth.unsupported_theme')
    }
  })

  it('ignores unknown fields (only whitelisted keys processed by handler)', () => {
    const r = validatePreferencesPatch({
      preferredLocale: 'en',
      role: 'admin',
      username: 'hacker',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.patch).toEqual({ preferredLocale: 'en' })
      expect('role' in r.patch).toBe(false)
    }
  })

  it('accepts empty body', () => {
    const r = validatePreferencesPatch({})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.patch).toEqual({})
  })
})
