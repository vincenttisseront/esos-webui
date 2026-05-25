import { describe, it, expect } from 'vitest'
import { buildUserSearchFilter } from '../server/utils/ldap-service'
import {
  buildLdapBindOnlySuccessDiagnostic,
  buildLdapTestConfigSummary,
  buildLdapUserNotFoundDiagnostic,
  ldapUserSearchFilterTemplate,
} from '../server/utils/ldap-diagnostics'

const baseLdap = {
  enabled:            true,
  url:                'ldaps://dc.example.com:636',
  startTls:           false,
  tlsVerify:          true,
  bindDn:             'CN=svc,OU=Services,DC=example,DC=com',
  bindPasswordSet:    true,
  baseDn:             'DC=example,DC=com',
  userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
  usernameAttribute:  'sAMAccountName',
  displayNameAttribute: 'displayName',
  groupAttribute:     'memberOf',
  timeoutSec:         10,
}

describe('ldap-service buildUserSearchFilter', () => {
  it('renders filter with escaped username (no probe placeholder)', () => {
    const filter = buildUserSearchFilter(baseLdap, 'j.dupont')
    expect(filter).toBe('(&(objectClass=user)(sAMAccountName=j.dupont))')
    expect(filter).not.toContain('__probe__')
    expect(filter).not.toContain('{{username}}')
  })

  it('escapes LDAP metacharacters in username', () => {
    const filter = buildUserSearchFilter(baseLdap, 'user*test')
    expect(filter).toContain('\\2a')
    expect(filter).not.toContain('user*test')
  })

  it('bind-only config summary uses {{username}} template, not probe', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    expect(config.userFilter).toBe('(&(objectClass=user)(sAMAccountName={{username}}))')
    expect(config.userFilter).not.toContain('__probe__')
  })

  it('lookup config summary shows rendered filter', () => {
    const user = 'alice'
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   user,
      userFilter: buildUserSearchFilter(baseLdap, user),
    })
    expect(config.lookupUsername).toBe('alice')
    expect(config.userFilter).toBe('(&(objectClass=user)(sAMAccountName=alice))')
  })
})

describe('ldap bind-only diagnostics', () => {
  it('bind-only success uses bind_ok code and template filter', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const d = buildLdapBindOnlySuccessDiagnostic(baseLdap, config)
    expect(d.safeCode).toBe('bind_ok')
    expect(d.step).toBe('bind')
    expect(d.config.userFilter).toContain('{{username}}')
  })

  it('user not found is distinct from LDAP operation error', () => {
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   'missing',
      userFilter: buildUserSearchFilter(baseLdap, 'missing'),
    })
    const d = buildLdapUserNotFoundDiagnostic(baseLdap, config)
    expect(d.safeCode).toBe('user_not_found')
    expect(d.step).toBe('userSearch')
  })

  it('ldapUserSearchFilterTemplate adds username placeholder when missing', () => {
    const tpl = ldapUserSearchFilterTemplate({
      ...baseLdap,
      userSearchFilter: '(objectClass=user)',
    })
    expect(tpl).toContain('{{username}}')
    expect(tpl).toContain('sAMAccountName')
  })
})
