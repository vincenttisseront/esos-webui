import { describe, it, expect } from 'vitest'
import { escapeLdapFilterValue, assertSafeLdapLoginUsername } from '../server/utils/ldap-filter-escape'
import { parseAuthMappingRulesJson, resolveRoleFromOidcClaims, capRole } from '../server/utils/auth-providers-role-map'
import { idTokenSatisfiesMfaPolicy, hasIdpMfaIndicators } from '../server/utils/auth-providers-mfa'
import { hashAuthOpaqueToken } from '../server/utils/auth-state-hash'
import { oidcClaimsAllowAutoLinkToExistingAccount } from '../server/utils/oidc-user-resolve'
import {
  authProviderSecurityAlerts,
  authProviderSummaryBadges,
  ldapConnectionModeKind,
  oidcCallbackPreview,
  parseMappingRulesJsonForUi,
} from '../utils/auth-providers-admin-ui'

describe('ldap-filter-escape', () => {
  it('escapes RFC4515 special characters', () => {
    expect(escapeLdapFilterValue('a*b(c)d\\e')).toBe('a\\2ab\\28c\\29d\\5ce')
  })
})

describe('auth-providers-role-map', () => {
  it('parses OIDC mapping rules', () => {
    const raw = JSON.stringify([
      { match: { type: 'oidc_claim', claim: 'groups', contains: 'ESOS-Admins' }, role: 'admin' },
    ])
    const rules = parseAuthMappingRulesJson(raw)
    expect(rules.length).toBe(1)
    const role = resolveRoleFromOidcClaims(
      { groups: ['Other', 'ESOS-Admins'] },
      rules,
      'viewer',
    )
    expect(role).toBe('admin')
  })

  it('caps role', () => {
    expect(capRole('admin', 'operator')).toBe('operator')
  })
})

describe('auth-providers-mfa', () => {
  it('idp_required accepts amr mfa', () => {
    const r = idTokenSatisfiesMfaPolicy({ amr: ['pwd', 'mfa'] }, 'idp_required')
    expect(r.ok).toBe(true)
  })

  it('idp_required rejects without hints', () => {
    const r = idTokenSatisfiesMfaPolicy({ amr: ['pwd'] }, 'idp_required')
    expect(r.ok).toBe(false)
  })

  it('idp_required accepts amr as single string', () => {
    expect(hasIdpMfaIndicators({ amr: 'mfa' })).toBe(true)
    const r = idTokenSatisfiesMfaPolicy({ amr: 'mfa' }, 'idp_required')
    expect(r.ok).toBe(true)
  })

  it('idp_required accepts acr with MFA substring', () => {
    const r = idTokenSatisfiesMfaPolicy({ acr: 'urn:example:policy:mfa-step' }, 'idp_required')
    expect(r.ok).toBe(true)
  })

  it('idp_required rejects generic acr without MFA hint', () => {
    const r = idTokenSatisfiesMfaPolicy({ acr: 'urn:mace:incommon:iap:bronze' }, 'idp_required')
    expect(r.ok).toBe(false)
  })

  it('idp_preferred allows login without MFA indicators', () => {
    const r = idTokenSatisfiesMfaPolicy({ amr: ['pwd'] }, 'idp_preferred')
    expect(r.ok).toBe(true)
  })
})

describe('oidc auto-link policy', () => {
  it('allows auto-link only when email_verified is asserted', () => {
    expect(oidcClaimsAllowAutoLinkToExistingAccount({})).toBe(false)
    expect(oidcClaimsAllowAutoLinkToExistingAccount({ email_verified: false })).toBe(false)
    expect(oidcClaimsAllowAutoLinkToExistingAccount({ email_verified: true })).toBe(true)
    expect(oidcClaimsAllowAutoLinkToExistingAccount({ email_verified: 'true' })).toBe(true)
  })
})

describe('auth-state-hash', () => {
  it('is deterministic for vitest pepper', () => {
    process.env.VITEST = 'true'
    const a = hashAuthOpaqueToken('state-1')
    const b = hashAuthOpaqueToken('state-1')
    expect(a).toBe(b)
    expect(a.length).toBe(64)
  })
})

describe('assertSafeLdapLoginUsername', () => {
  it('throws on wildcard', () => {
    expect(() => assertSafeLdapLoginUsername('bad*user')).toThrow()
  })
})

describe('auth-providers-admin-ui', () => {
  it('oidcCallbackPreview joins origin and path', () => {
    expect(oidcCallbackPreview('https://app.example', '/api/auth/oidc/callback')).toBe(
      'https://app.example/api/auth/oidc/callback',
    )
    expect(oidcCallbackPreview('https://app.example/', 'callback')).toBe('https://app.example/callback')
  })

  it('parseMappingRulesJsonForUi validates array JSON', () => {
    expect(parseMappingRulesJsonForUi('[]')).toEqual({ ok: true, length: 0 })
    expect(parseMappingRulesJsonForUi('[1]')).toEqual({ ok: true, length: 1 })
    expect(parseMappingRulesJsonForUi('{}')).toEqual({ ok: false, code: 'not_array' })
    expect(parseMappingRulesJsonForUi('')).toEqual({ ok: false, code: 'empty' })
    expect(parseMappingRulesJsonForUi('   ')).toEqual({ ok: false, code: 'empty' })
    expect(parseMappingRulesJsonForUi('{').ok).toBe(false)
    if (!parseMappingRulesJsonForUi('{').ok) {
      expect(parseMappingRulesJsonForUi('{').code).toBe('invalid_syntax')
    }
  })

  it('ldapConnectionModeKind classifies URL and StartTLS', () => {
    expect(ldapConnectionModeKind('ldaps://dc.example.com', false)).toBe('ldaps')
    expect(ldapConnectionModeKind('ldap://127.0.0.1:389', false)).toBe('ldap_localhost_plain')
    expect(ldapConnectionModeKind('ldap://dc.example.com', true)).toBe('ldap_start_tls')
    expect(ldapConnectionModeKind('ldap://dc.example.com', false)).toBe('ldap_plain_remote')
    expect(ldapConnectionModeKind('', false)).toBe('empty')
  })

  it('authProviderSecurityAlerts flags TLS verify off when LDAP enabled', () => {
    const a = authProviderSecurityAlerts({
      ldapUrl:          'ldaps://x',
      ldapStartTls:     false,
      ldapTlsVerify:    false,
      ldapEnabled:      true,
      oidcIssuer:       '',
      oidcEnabled:      false,
      mfaMode:          'off',
      jitDefaultRole:   'viewer',
      mappingRulesJson: '[]',
    })
    expect(a.some((x) => x.id === 'ldap_tls_verify_disabled')).toBe(true)
  })

  it('authProviderSummaryBadges reflects MFA mode when OIDC enabled', () => {
    const req = authProviderSummaryBadges({
      mfaMode:             'idp_required',
      ldapEnabled:         false,
      ldapTlsVerify:       true,
      oidcClientSecretSet: true,
      ldapBindPasswordSet: false,
      mappingRulesJson:    '[]',
      oidcEnabled:         true,
    })
    expect(req.some((b) => b.id === 'oidc_mfa_required')).toBe(true)

    const off = authProviderSummaryBadges({
      mfaMode:             'off',
      ldapEnabled:         false,
      ldapTlsVerify:       true,
      oidcClientSecretSet: true,
      ldapBindPasswordSet: false,
      mappingRulesJson:    '[]',
      oidcEnabled:         true,
    })
    expect(off.some((b) => b.id === 'oidc_mfa_off')).toBe(true)
  })

  it('authProviderSummaryBadges shows mapping and secrets state', () => {
    const withRules = authProviderSummaryBadges({
      mfaMode:             'off',
      ldapEnabled:         false,
      ldapTlsVerify:       true,
      oidcClientSecretSet: true,
      ldapBindPasswordSet: false,
      mappingRulesJson:    '[{"x":1}]',
      oidcEnabled:         false,
    })
    const mr = withRules.find((b) => b.id === 'mapping_rules')
    expect(mr).toBeDefined()
    expect(mr?.ruleCount).toBe(1)

    const badJson = authProviderSummaryBadges({
      mfaMode:             'off',
      ldapEnabled:         false,
      ldapTlsVerify:       true,
      oidcClientSecretSet: true,
      ldapBindPasswordSet: false,
      mappingRulesJson:    '{',
      oidcEnabled:         false,
    })
    expect(badJson.some((b) => b.id === 'mapping_invalid')).toBe(true)

    const secretsIncomplete = authProviderSummaryBadges({
      mfaMode:             'off',
      ldapEnabled:         true,
      ldapTlsVerify:       true,
      oidcClientSecretSet: false,
      ldapBindPasswordSet: false,
      mappingRulesJson:    '[]',
      oidcEnabled:         true,
    })
    expect(secretsIncomplete.some((b) => b.id === 'secrets_incomplete')).toBe(true)
  })
})
