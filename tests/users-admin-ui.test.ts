import { describe, it, expect } from 'vitest'
import {
  canAdminResetUserPassword,
  externalIdentityDisplay,
  externalProviderLabel,
  filterUsersByAuthSource,
  normalizeUserAuthSource,
} from '../utils/users-admin-ui'
import type { UserPublic } from '../utils/types'

const sample = (overrides: Partial<UserPublic>): UserPublic => ({
  id:                  '1',
  username:            'alice',
  displayName:         null,
  role:                'viewer',
  active:              true,
  forcePasswordChange: false,
  createdAt:           '2026-01-01T00:00:00.000Z',
  lastLoginAt:         null,
  createdBy:           null,
  authSource:          'local',
  ...overrides,
})

describe('users-admin-ui', () => {
  it('normalizes auth source with unknown fallback', () => {
    expect(normalizeUserAuthSource('ldap')).toBe('ldap')
    expect(normalizeUserAuthSource('oidc')).toBe('oidc')
    expect(normalizeUserAuthSource('')).toBe('unknown')
    expect(normalizeUserAuthSource('saml')).toBe('unknown')
  })

  it('allows password reset only for local users', () => {
    expect(canAdminResetUserPassword(sample({ authSource: 'local' }))).toBe(true)
    expect(canAdminResetUserPassword(sample({ authSource: 'ldap' }))).toBe(false)
    expect(canAdminResetUserPassword(sample({ authSource: 'oidc' }))).toBe(false)
  })

  it('filters users by authentication source', () => {
    const users = [
      sample({ id: '1', authSource: 'local' }),
      sample({ id: '2', authSource: 'ldap' }),
      sample({ id: '3', authSource: 'oidc' }),
    ]
    expect(filterUsersByAuthSource(users, 'ldap').map((u) => u.id)).toEqual(['2'])
    expect(filterUsersByAuthSource(users, 'all')).toHaveLength(3)
  })

  it('formats external provider host from issuer URL', () => {
    expect(
      externalProviderLabel({
        externalIssuer: 'ldaps://windc04.ar-systems.fr:636',
      }),
    ).toBe('windc04.ar-systems.fr:636')
  })

  it('prefers external login over DN for identity display', () => {
    expect(
      externalIdentityDisplay({
        externalLogin:   'vincent.tisseront',
        externalEmail:   'v@corp.local',
        externalSubject: 'CN=User,DC=corp',
      }),
    ).toBe('vincent.tisseront')
  })
})
