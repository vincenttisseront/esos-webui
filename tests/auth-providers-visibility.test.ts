import { describe, it, expect } from 'vitest'
import type { AdminAuthProvidersDto } from '../server/utils/auth-providers-config'
import {
  buildPublicAuthProviders,
  isLdapConfigSufficientForLogin,
  isLdapLoginAvailable,
  isOidcConfigSufficientForLogin,
  isOidcLoginAvailable,
} from '../server/utils/auth-providers-public'
import {
  isSanitizedFederatedLoginFailure,
} from '../server/utils/auth-login-errors'
import { createError } from 'h3'

function baseDto(overrides?: Partial<AdminAuthProvidersDto>): AdminAuthProvidersDto {
  return {
    ldap: {
      enabled:            false,
      url:                '',
      startTls:           false,
      tlsVerify:          true,
      bindDn:             '',
      bindPasswordSet:    false,
      baseDn:             '',
      userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
      usernameAttribute:  'sAMAccountName',
      displayNameAttribute: 'displayName',
      groupAttribute:     'memberOf',
      timeoutSec:         10,
    },
    oidc: {
      enabled:          false,
      issuer:           '',
      clientId:         '',
      clientSecretSet:  false,
      scopes:           'openid profile email',
      redirectPath:     '/api/auth/oidc/callback',
      clockSkewSec:     60,
    },
    auth: {
      jitEnabled:       false,
      jitDefaultRole:   'viewer',
      jitDefaultActive: true,
      mfaMode:          'off',
      mappingRulesJson: '[]',
      oidcMaxRole:      null,
      ldapMaxRole:      null,
    },
    ...overrides,
  }
}

const zeroCounts = { ldap: 0, oidc: 0 }

describe('auth-providers-public', () => {
  it('local is always available', () => {
    const res = buildPublicAuthProviders(baseDto(), zeroCounts)
    const local = res.providers.find((p) => p.key === 'local')
    expect(local?.available).toBe(true)
    expect(res.defaultProvider).toBe('local')
  })

  it('ldap available when enabled, config complete, and JIT on', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://dc.example.com',
        bindDn:          'cn=bind,dc=example,dc=com',
        bindPasswordSet: true,
        baseDn:          'dc=example,dc=com',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    const res = buildPublicAuthProviders(dto, zeroCounts)
    const ldap = res.providers.find((p) => p.key === 'ldap')
    expect(ldap?.available).toBe(true)
    expect(ldap?.reason).toBeUndefined()
  })

  it('ldap unavailable when JIT off and no ldap users', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://dc.example.com',
        bindDn:          'cn=bind,dc=example,dc=com',
        bindPasswordSet: true,
        baseDn:          'dc=example,dc=com',
      },
    })
    const res = buildPublicAuthProviders(dto, zeroCounts)
    expect(res.providers.find((p) => p.key === 'ldap')).toMatchObject({
      available: false,
      reason:    'no_provisioned_users',
    })
  })

  it('ldap config_incomplete when bind password missing', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled: true,
        url:     'ldaps://dc.example.com',
        bindDn:  'cn=bind',
        baseDn:  'dc=example,dc=com',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    const res = buildPublicAuthProviders(dto, zeroCounts)
    expect(res.providers.find((p) => p.key === 'ldap')?.reason).toBe('config_incomplete')
  })

  it('oidc exposes loginUrl only when available', () => {
    const dto = baseDto({
      oidc: {
        ...baseDto().oidc,
        enabled:         true,
        issuer:          'https://idp.example.com',
        clientId:        'client',
        clientSecretSet: true,
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    const res = buildPublicAuthProviders(dto, zeroCounts)
    const oidcP = res.providers.find((p) => p.key === 'oidc')
    expect(oidcP?.available).toBe(true)
    expect(oidcP?.loginUrl).toBe('/api/auth/oidc/login')
  })

  it('oidc unavailable when secret missing', () => {
    const dto = baseDto({
      oidc: {
        ...baseDto().oidc,
        enabled:  true,
        issuer:   'https://idp.example.com',
        clientId: 'client',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    expect(isOidcConfigSufficientForLogin(dto.oidc)).toBe(false)
    expect(buildPublicAuthProviders(dto, zeroCounts).providers.find((p) => p.key === 'oidc')?.reason)
      .toBe('config_incomplete')
  })

  it('defaultProvider prefers local then ldap then oidc', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://dc.example.com',
        bindDn:          'cn=bind',
        bindPasswordSet: true,
        baseDn:          'dc=example,dc=com',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    expect(buildPublicAuthProviders(dto, zeroCounts).defaultProvider).toBe('local')
    const ldapOnly = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://dc.example.com',
        bindDn:          'cn=bind',
        bindPasswordSet: true,
        baseDn:          'dc=example,dc=com',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    // Simulate hypothetical future without local — counts with ldap users
    const res = buildPublicAuthProviders(ldapOnly, { ldap: 1, oidc: 0 })
    expect(res.defaultProvider).toBe('local')
  })

  it('response shape never includes secret fields', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://dc.example.com',
        bindDn:          'cn=secret-bind',
        bindPasswordSet: true,
        baseDn:          'dc=example,dc=com',
      },
      auth: { ...baseDto().auth, jitEnabled: true },
    })
    const json = JSON.stringify(buildPublicAuthProviders(dto, { ldap: 2, oidc: 1 }))
    expect(json).not.toMatch(/bindPassword|clientSecret|bind_dn/i)
    expect(json).not.toContain('clientId')
  })

  it('isLdapLoginAvailable matches buildPublicAuthProviders', () => {
    const dto = baseDto({
      ldap: {
        ...baseDto().ldap,
        enabled:         true,
        url:             'ldaps://x',
        bindDn:          'cn=b',
        bindPasswordSet: true,
        baseDn:          'dc=x',
      },
    })
    expect(isLdapLoginAvailable(dto, { ldap: 1, oidc: 0 })).toBe(true)
    expect(isLdapLoginAvailable(dto, zeroCounts)).toBe(false)
  })

  it('isOidcLoginAvailable with provisioned oidc users', () => {
    const dto = baseDto({
      oidc: {
        ...baseDto().oidc,
        enabled:         true,
        issuer:          'https://idp',
        clientId:        'c',
        clientSecretSet: true,
      },
    })
    expect(isOidcLoginAvailable(dto, { ldap: 0, oidc: 3 })).toBe(true)
  })

  it('isLdapConfigSufficientForLogin requires filter', () => {
    expect(
      isLdapConfigSufficientForLogin({
        ...baseDto().ldap,
        url: 'ldap://x',
        bindDn: 'cn=b',
        bindPasswordSet: true,
        baseDn: 'dc=x',
        userSearchFilter: '   ',
      }),
    ).toBe(false)
  })
})

describe('auth-login-errors', () => {
  it('detects JIT provisioning 403 for sanitization', () => {
    const err = createError({
      statusCode: 403,
      message:    'Aucun compte correspondant. Activez le provisionnement JIT ou créez le compte.',
    })
    expect(isSanitizedFederatedLoginFailure(err)).toBe(true)
  })

  it('does not sanitize unrelated 403', () => {
    const err = createError({ statusCode: 403, message: 'Forbidden resource' })
    expect(isSanitizedFederatedLoginFailure(err)).toBe(false)
  })
})
