import { describe, it, expect } from 'vitest'
import {
  normalizeLdapLoginUsername,
  pruneEmptyLdapFilterClauses,
  renderLdapUserFilter,
  renderUserSearchFilter,
  buildLdapUserSearchFilter,
  ldapDefaultUpnSuffix,
} from '../server/utils/ldap-username-normalize'
import { escapeLdapFilterValue } from '../server/utils/ldap-filter-escape'
import { buildUserSearchFilter } from '../server/utils/ldap-service'
import { buildDirectorySearchFilter } from '../server/utils/ldap-directory'
import { ldapAdFullPreset } from '../server/utils/ldap-ad-defaults'

const adFilter
  = '(&(objectCategory=person)(objectClass=user)(|(sAMAccountName={{accountName}})(userPrincipalName={{userPrincipalName}})))'

const baseLdap = {
  enabled:              true,
  url:                  'ldaps://windc04.ar-systems.fr:636',
  startTls:             false,
  tlsVerify:            true,
  bindDn:               'CN=svc,DC=ar-systems,DC=fr',
  bindPasswordSet:      true,
  baseDn:               'OU=AR-Users,DC=ar-systems,DC=fr',
  userSearchFilter:     adFilter,
  usernameAttribute:    'sAMAccountName',
  displayNameAttribute: 'displayName',
  groupAttribute:       'memberOf',
  timeoutSec:           10,
}

describe('normalizeLdapLoginUsername', () => {
  it('normalizes DOMAIN\\user', () => {
    const n = normalizeLdapLoginUsername('ar-systems\\vincent.tisseront')
    expect(n.rawUsername).toBe('ar-systems\\vincent.tisseront')
    expect(n.domainPrefix).toBe('ar-systems')
    expect(n.accountName).toBe('vincent.tisseront')
    expect(n.userPrincipalName).toBeNull()
  })

  it('normalizes user@domain', () => {
    const n = normalizeLdapLoginUsername('vincent.tisseront@ar-systems.fr')
    expect(n.accountName).toBe('vincent.tisseront')
    expect(n.userPrincipalName).toBe('vincent.tisseront@ar-systems.fr')
    expect(n.domainPrefix).toBeNull()
  })

  it('normalizes plain user with optional default UPN suffix', () => {
    const n = normalizeLdapLoginUsername('vincent.tisseront', {
      defaultUpnSuffix: 'ar-systems.fr',
    })
    expect(n.accountName).toBe('vincent.tisseront')
    expect(n.userPrincipalName).toBe('vincent.tisseront@ar-systems.fr')
  })

  it('plain user without suffix has no UPN', () => {
    const n = normalizeLdapLoginUsername('vincent.tisseront')
    expect(n.userPrincipalName).toBeNull()
  })
})

describe('renderUserSearchFilter', () => {
  it('omits empty UPN clause from AD filter', () => {
    const identity = normalizeLdapLoginUsername('ar-systems\\vincent.tisseront')
    const filter = renderUserSearchFilter(adFilter, 'sAMAccountName', identity)
    expect(filter).toBe(
      '(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=vincent.tisseront)))',
    )
    expect(filter).not.toContain('userPrincipalName')
    expect(filter).not.toContain('ar-systems')
  })

  it('includes UPN clause when present', () => {
    const identity = normalizeLdapLoginUsername('vincent.tisseront@ar-systems.fr')
    const filter = renderUserSearchFilter(adFilter, 'sAMAccountName', identity)
    expect(filter).toContain('(sAMAccountName=vincent.tisseront)')
    expect(filter).toContain('(userPrincipalName=vincent.tisseront@ar-systems.fr)')
  })

  it('escapes LDAP metacharacters in values', () => {
    const identity = normalizeLdapLoginUsername('user(test)*')
    const filter = renderUserSearchFilter(
      '(&(objectClass=user)(sAMAccountName={{accountName}}))',
      'sAMAccountName',
      identity,
    )
    expect(filter).toContain('\\28')
    expect(filter).toContain('\\29')
    expect(filter).toContain('\\2a')
    expect(filter).not.toMatch(/\(test\)/)
  })

  it('legacy {{username}} uses normalized accountName for login search', () => {
    const identity = normalizeLdapLoginUsername('ar-systems\\vincent.tisseront')
    const filter = renderLdapUserFilter(
      '(&(objectClass=user)(sAMAccountName={{username}}))',
      'sAMAccountName',
      identity,
      { normalizeLegacyUsernamePlaceholder: true },
    )
    expect(filter).toBe('(&(objectClass=user)(sAMAccountName=vincent.tisseront))')
    expect(filter).not.toContain('\\5c')
  })

  it('legacy {{username}} can keep raw input for template preview', () => {
    const identity = normalizeLdapLoginUsername('corp\\alice')
    const filter = renderLdapUserFilter(
      '(sAMAccountName={{username}})',
      'sAMAccountName',
      identity,
      { normalizeLegacyUsernamePlaceholder: false },
    )
    expect(filter).toBe('(sAMAccountName=corp\\5calice)')
  })
})

describe('provisioning vs login filter alignment', () => {
  const legacyFilter = '(&(objectClass=user)(sAMAccountName={{username}}))'

  it('login and legacy filter share normalized sAMAccountName for DOMAIN\\user', () => {
    const input = 'ar-systems\\vincent.tisseront'
    const loginFilter = buildLdapUserSearchFilter(
      { ...baseLdap, userSearchFilter: legacyFilter },
      input,
    )
    const dirFilter = buildDirectorySearchFilter(
      { ...baseLdap, userSearchFilter: legacyFilter },
      input,
    )
    expect(loginFilter).toContain('(sAMAccountName=vincent.tisseront)')
    expect(dirFilter).toContain('(sAMAccountName=*vincent.tisseront*)')
    expect(loginFilter).not.toContain('ar-systems')
  })

  it('buildUserSearchFilter matches buildLdapUserSearchFilter', () => {
    const input = 'vincent.tisseront@ar-systems.fr'
    expect(buildUserSearchFilter(baseLdap, input)).toBe(buildLdapUserSearchFilter(baseLdap, input))
  })
})

describe('escapeLdapFilterValue', () => {
  it('escapes backslash, parentheses, and asterisk', () => {
    expect(escapeLdapFilterValue('a\\b(c)*')).toBe('a\\5cb\\28c\\29\\2a')
  })
})

describe('buildUserSearchFilter login search', () => {
  it('finds user with normalized accountName for DOMAIN\\user', () => {
    const filter = buildUserSearchFilter(baseLdap, 'ar-systems\\vincent.tisseront')
    expect(filter).toContain('(sAMAccountName=vincent.tisseront)')
    expect(filter).not.toContain('ar-systems\\5c')
  })

  it('uses UPN for user@domain input', () => {
    const filter = buildUserSearchFilter(baseLdap, 'vincent.tisseront@ar-systems.fr')
    expect(filter).toContain('(userPrincipalName=vincent.tisseront@ar-systems.fr)')
    expect(filter).toContain('(sAMAccountName=vincent.tisseront)')
  })
})

describe('ldapDefaultUpnSuffix', () => {
  it('derives FQDN from base DN', () => {
    expect(ldapDefaultUpnSuffix('', 'OU=x,DC=ar-systems,DC=fr')).toBe('ar-systems.fr')
  })
})

describe('ldapAdFullPreset', () => {
  it('uses AD filter with accountName and userPrincipalName placeholders', () => {
    const preset = ldapAdFullPreset({
      url:    baseLdap.url,
      bindDn: baseLdap.bindDn,
      baseDn: baseLdap.baseDn,
    })
    expect(preset.userFilter).toContain('{{accountName}}')
    expect(preset.userFilter).toContain('{{userPrincipalName}}')
    expect(pruneEmptyLdapFilterClauses(
      preset.userFilter.replace('{{accountName}}', 'u').replace('{{userPrincipalName}}', ''),
    )).not.toContain('userPrincipalName')
  })
})
