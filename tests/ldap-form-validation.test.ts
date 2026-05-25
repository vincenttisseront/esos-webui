import { describe, it, expect } from 'vitest'
import {
  ldapFormValidationWarnings,
  ldapUrlSchemeHint,
  ldapConnectionModeChoiceFromForm,
} from '../utils/auth-providers-admin-ui'

describe('ldap form validation', () => {
  const base = {
    ldapUrl:              'ldaps://dc.example.com:636',
    ldapStartTls:         false,
    ldapTlsVerify:        true,
    ldapBindDn:           'CN=svc,DC=example,DC=com',
    ldapBaseDn:           'DC=example,DC=com',
    ldapUserSearchFilter: '(&(objectClass=user)(sAMAccountName={{username}}))',
    ldapUsernameAttribute: 'sAMAccountName',
    ldapTimeoutSec:       10,
    ldapBindPasswordSet:  true,
    ldapBindPwDraft:      '',
  }

  it('flags URL scheme mismatch when URL lacks ldaps:// for LDAPS mode', () => {
    const warnings = ldapFormValidationWarnings({
      ...base,
      ldapUrl: 'dc.example.com',
    })
    expect(warnings).toContain('url_scheme_mismatch')
    expect(ldapUrlSchemeHint('ldaps', 'ldap://x')).toBe('wrong_scheme')
  })

  it('flags missing bind password when not stored', () => {
    const warnings = ldapFormValidationWarnings({
      ...base,
      ldapBindPasswordSet: false,
    })
    expect(warnings).toContain('bind_password_missing')
  })

  it('connection mode choice maps starttls from form', () => {
    expect(ldapConnectionModeChoiceFromForm('ldap://dc.example.com', true)).toBe('starttls')
    expect(ldapUrlSchemeHint('starttls', 'ldap://dc.example.com')).toBe('ok')
  })
})
