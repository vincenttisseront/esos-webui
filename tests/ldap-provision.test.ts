import { describe, it, expect } from 'vitest'
import type { AdminAuthProvidersDto } from '../server/utils/auth-providers-config'
import { suggestRoleForLdapGroups } from '../server/utils/ldap-provision'
import { mapSearchRowsToDirectoryUsers } from '../server/utils/ldap-directory'
import type { SearchRow } from '../server/utils/ldap-service'

const baseDto = (): AdminAuthProvidersDto => ({
  summary: {
    counts: { local: 0, ldap: 0, oidc: 0 },
    config: { ldapComplete: true, oidcComplete: false },
    login: {
      ldap: { available: false },
      oidc: { available: false },
    },
  },
  ldap: {
    enabled:            true,
    url:                'ldap://dc.example.com',
    startTls:           false,
    tlsVerify:          true,
    bindDn:             'cn=bind',
    bindPasswordSet:    true,
    baseDn:             'dc=example,dc=com',
    userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
    usernameAttribute:  'sAMAccountName',
    displayNameAttribute: 'displayName',
    groupAttribute:     'memberOf',
    timeoutSec:         10,
  },
  oidc: {
    enabled:         false,
    issuer:          '',
    clientId:        '',
    clientSecretSet: false,
    scopes:          'openid',
    redirectPath:    '/api/auth/oidc/callback',
    clockSkewSec:    60,
  },
  auth: {
    jitEnabled:       false,
    jitDefaultRole:   'viewer',
    jitDefaultActive: true,
    mfaMode:          'off',
    mappingRulesJson: JSON.stringify([
      { match: { type: 'ldap_group_dn', contains: 'CN=Ops' }, role: 'operator' },
    ]),
    oidcMaxRole: null,
    ldapMaxRole:   null,
  },
})

describe('ldap-provision suggestRoleForLdapGroups', () => {
  it('suggests operator when group rule matches', () => {
    const { role, ruleIndex } = suggestRoleForLdapGroups(baseDto(), [
      'CN=Ops,OU=Groups,DC=example,DC=com',
    ])
    expect(role).toBe('operator')
    expect(ruleIndex).toBe(0)
  })

  it('falls back to default role when no group match', () => {
    const { role, ruleIndex } = suggestRoleForLdapGroups(baseDto(), ['CN=Other,DC=example,DC=com'])
    expect(role).toBe('viewer')
    expect(ruleIndex).toBeNull()
  })

  it('applies ldap max role cap', () => {
    const dto = baseDto()
    dto.auth.ldapMaxRole = 'viewer'
    const { role } = suggestRoleForLdapGroups(dto, ['CN=Ops,OU=Groups,DC=example,DC=com'])
    expect(role).toBe('viewer')
  })
})

describe('ldap-directory mapSearchRowsToDirectoryUsers', () => {
  const rows: SearchRow[] = [
    {
      dn:                'CN=Alice,DC=example,DC=com',
      displayName:       'Alice',
      groupDns:          [],
      groupAttrPresent:  false,
      attributesPreview: { sAMAccountName: 'alice', mail: 'a@example.com' },
    },
  ]

  it('marks imported users by DN', () => {
    const mapped = mapSearchRowsToDirectoryUsers(rows, baseDto().ldap, [
      {
        id:            'u1',
        username:      'alice',
        displayName:   'Alice',
        role:          'operator',
        active:        true,
        externalLogin: 'alice',
        externalEmail:   'a@example.com',
        dn:            'CN=Alice,DC=example,DC=com',
        lastLoginAt:   null,
      },
    ])
    expect(mapped[0]?.esosStatus).toBe('imported')
    expect(mapped[0]?.esosUsername).toBe('alice')
  })

  it('marks inactive imported users', () => {
    const mapped = mapSearchRowsToDirectoryUsers(rows, baseDto().ldap, [
      {
        id:            'u1',
        username:      'alice',
        displayName:   null,
        role:          'viewer',
        active:        false,
        externalLogin: null,
        externalEmail: null,
        dn:            'CN=Alice,DC=example,DC=com',
        lastLoginAt:   null,
      },
    ])
    expect(mapped[0]?.esosStatus).toBe('imported_inactive')
  })
})

