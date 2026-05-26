import { describe, it, expect } from 'vitest'
import { createError } from 'h3'
import { assertSafeLdapSearchQuery } from '../server/utils/ldap-filter-escape'
import { buildDirectorySearchFilter } from '../server/utils/ldap-directory'

const ldapDto = {
  enabled:            true,
  url:                'ldaps://dc.example.com',
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
}

describe('ldap directory search filter', () => {
  it('buildDirectorySearchFilter escapes query and uses configured attributes', () => {
    const filter = buildDirectorySearchFilter(ldapDto, 'dup*ont')
    expect(filter).toContain('\\2a')
    expect(filter).not.toContain('dup*ont')
    expect(filter).toContain('(sAMAccountName=*')
    expect(filter).toContain('(displayName=*')
    expect(filter).toContain('(mail=*')
    expect(filter).toMatch(/^\(&\(objectCategory=person\)\(objectClass=user\)\(\|/)
  })

  it('assertSafeLdapSearchQuery rejects short and dangerous input', () => {
    expect(() => assertSafeLdapSearchQuery('a')).toThrow()
    expect(() => assertSafeLdapSearchQuery('ab()')).toThrow()
    expect(() => assertSafeLdapSearchQuery('valid')).not.toThrow()
  })

  it('assertSafeLdapSearchQuery throws h3 error with 400', () => {
    try {
      assertSafeLdapSearchQuery('*')
    } catch (e) {
      expect((e as ReturnType<typeof createError>).statusCode).toBe(400)
    }
  })
})
