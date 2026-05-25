import { describe, it, expect } from 'vitest'
import type { AdminAuthProvidersDto } from '../server/utils/auth-providers-config'
import {
  authProvidersFormDirty,
  authProvidersLdapDirty,
  authProvidersMappingDirty,
  authProvidersOidcDirty,
  authProvidersSecurityDirty,
  normalizeMappingRulesJson,
  snapshotFromDto,
  snapshotFromFormInput,
} from '../utils/auth-providers-form-state'

function baseDto(): AdminAuthProvidersDto {
  return {
    summary: {
      counts: { local: 1, ldap: 0, oidc: 0 },
      config: { ldapComplete: false, oidcComplete: false },
      login: { ldap: { available: false }, oidc: { available: false } },
    },
    ldap: {
      enabled:            false,
      url:                'ldaps://dc.example.com',
      startTls:           false,
      tlsVerify:          true,
      bindDn:             'CN=svc,DC=example,DC=com',
      bindPasswordSet:    true,
      baseDn:             'DC=example,DC=com',
      userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
      usernameAttribute:  'sAMAccountName',
      displayNameAttribute: 'displayName',
      groupAttribute:     'memberOf',
      timeoutSec:         10,
    },
    oidc: {
      enabled:          false,
      issuer:           'https://idp.example.com',
      clientId:         'client-id',
      clientSecretSet:  true,
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
  }
}

function formFromDto(d: AdminAuthProvidersDto) {
  return {
    ldapEnabled:             d.ldap.enabled,
    ldapUrl:                 d.ldap.url,
    ldapStartTls:            d.ldap.startTls,
    ldapTlsVerify:           d.ldap.tlsVerify,
    ldapBindDn:              d.ldap.bindDn,
    ldapBaseDn:              d.ldap.baseDn,
    ldapUserSearchFilter:    d.ldap.userSearchFilter,
    ldapUsernameAttribute:   d.ldap.usernameAttribute,
    ldapDisplayNameAttribute: d.ldap.displayNameAttribute,
    ldapGroupAttribute:      d.ldap.groupAttribute,
    ldapTimeoutSec:          d.ldap.timeoutSec,
    oidcEnabled:       d.oidc.enabled,
    oidcIssuer:        d.oidc.issuer,
    oidcClientId:      d.oidc.clientId,
    oidcScopes:        d.oidc.scopes,
    oidcRedirectPath:  d.oidc.redirectPath,
    oidcClockSkewSec:  d.oidc.clockSkewSec,
    jitEnabled:        d.auth.jitEnabled,
    jitDefaultRole:    d.auth.jitDefaultRole,
    jitDefaultActive:  d.auth.jitDefaultActive,
    mfaMode:           d.auth.mfaMode,
    mappingRulesJson:  d.auth.mappingRulesJson,
    oidcMaxRole:       'none' as const,
    ldapMaxRole:       'none' as const,
  }
}

describe('auth-providers-form-state', () => {
  it('no changes => not dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const current  = snapshotFromFormInput(formFromDto(dto))
    expect(authProvidersFormDirty(baseline, current)).toBe(false)
  })

  it('change LDAP URL => dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const form     = formFromDto(dto)
    form.ldapUrl   = 'ldaps://other.example.com'
    const current  = snapshotFromFormInput(form)
    expect(authProvidersLdapDirty(baseline, current)).toBe(true)
    expect(authProvidersFormDirty(baseline, current)).toBe(true)
  })

  it('trims whitespace-only LDAP URL change back to same => not dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const form     = formFromDto(dto)
    form.ldapUrl   = '  ldaps://dc.example.com  '
    const current  = snapshotFromFormInput(form)
    expect(authProvidersFormDirty(baseline, current)).toBe(false)
  })

  it('blank password fields => not dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const current  = snapshotFromFormInput(formFromDto(dto), {
      ldapBindPassword: '',
      oidcClientSecret: '',
    })
    expect(current.ldapBindPasswordEntered).toBe(false)
    expect(current.oidcClientSecretEntered).toBe(false)
    expect(authProvidersFormDirty(baseline, current)).toBe(false)
  })

  it('entered LDAP password => dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const current  = snapshotFromFormInput(formFromDto(dto), { ldapBindPassword: 'new-secret' })
    expect(authProvidersLdapDirty(baseline, current)).toBe(true)
    expect(authProvidersOidcDirty(baseline, current)).toBe(false)
  })

  it('entered OIDC secret => dirty', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const current  = snapshotFromFormInput(formFromDto(dto), { oidcClientSecret: 'sec' })
    expect(authProvidersOidcDirty(baseline, current)).toBe(true)
  })

  it('mfa change => security dirty only, not mapping', () => {
    const dto = baseDto()
    const baseline = snapshotFromDto(dto)
    const form     = formFromDto(dto)
    form.mfaMode   = 'idp_required'
    const current  = snapshotFromFormInput(form)
    expect(authProvidersSecurityDirty(baseline, current)).toBe(true)
    expect(authProvidersMappingDirty(baseline, current)).toBe(false)
  })

  it('normalizeMappingRulesJson treats whitespace-only array as equivalent', () => {
    expect(normalizeMappingRulesJson('[]')).toBe('[]')
    expect(normalizeMappingRulesJson('  []  ')).toBe('[]')
  })
})
