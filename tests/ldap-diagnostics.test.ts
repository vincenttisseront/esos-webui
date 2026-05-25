import { describe, it, expect } from 'vitest'
import {
  maskBindPrincipal,
  buildLdapTestConfigSummary,
  buildLdapFailureDiagnostic,
  buildLdapValidationFailure,
  buildLdapCommandExamples,
  formatLdapDiagnosticForCopy,
} from '../server/utils/ldap-diagnostics'

describe('ldap-diagnostics', () => {
  const baseLdap = {
    enabled:            true,
    url:                'ldaps://dc.example.com:636',
    startTls:           false,
    tlsVerify:          true,
    bindDn:             'CN=svc-esos,OU=Services,DC=example,DC=com',
    bindPasswordSet:    true,
    baseDn:             'DC=example,DC=com',
    userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
    usernameAttribute:  'sAMAccountName',
    displayNameAttribute: 'displayName',
    groupAttribute:     'memberOf',
    timeoutSec:         10,
  }

  it('maskBindPrincipal masks UPN and DOMAIN user', () => {
    expect(maskBindPrincipal('admin@corp.local')).toMatch(/@corp\.local$/)
    expect(maskBindPrincipal('admin@corp.local')).not.toContain('admin')
    expect(maskBindPrincipal('CORP\\svc-esos')).toBe('CORP\\***')
  })

  it('buildLdapTestConfigSummary never includes password', () => {
    const c = buildLdapTestConfigSummary(baseLdap)
    expect(c.bindPrincipal).not.toContain('password')
    expect(c.serverUrl).toBe('ldaps://dc.example.com:636')
    expect(c.tlsMode).toBe('ldaps')
  })

  it('maps Operations Error to operations_error with AD hints', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const d = buildLdapFailureDiagnostic(
      { name: 'OperationsError', message: 'Operations Error', lde_errno: 1 },
      'bind',
      baseLdap,
      config,
    )
    expect(d.safeCode).toBe('operations_error')
    expect(d.step).toBe('bind')
    expect(d.hints).toContain('use_ldaps_or_starttls')
    expect(d.hints).toContain('verify_bind_format')
    expect(d.commandExamples?.openssl).toContain('openssl s_client')
  })

  it('validation failure for missing bind password', () => {
    const r = buildLdapValidationFailure(
      'bind',
      'bind_password_missing',
      { ...baseLdap, bindPasswordSet: false },
      buildLdapTestConfigSummary({ ...baseLdap, bindPasswordSet: false }),
    )
    expect(r.ok).toBe(false)
    expect(r.diagnostic.safeCode).toBe('bind_password_missing')
  })

  it('formatLdapDiagnosticForCopy omits secrets', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const d = buildLdapFailureDiagnostic(
      new Error('Operations Error'),
      'bind',
      baseLdap,
      config,
    )
    const text = formatLdapDiagnosticForCopy(d, {
      summaryLabel:   'LDAP test failed',
      failedStep:     'Step',
      stepLabel:      'bind',
      safeMessage:    'Message',
      configTitle:    'Config',
      hintLines:      ['hint1'],
      commandsTitle:  'Commands',
      commandLines:   d.commandExamples?.ldapsearch ? [d.commandExamples.ldapsearch] : [],
    })
    expect(text).not.toMatch(/password/i)
    expect(text).toContain('ldaps://dc.example.com')
    expect(text).toContain('ldapsearch')
  })

  it('buildLdapCommandExamples includes ldapsearch and openssl for ldaps', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const ex = buildLdapCommandExamples(baseLdap, config)
    expect(ex.ldapsearch).toContain('ldapsearch')
    expect(ex.ldapsearch).toContain('-W')
    expect(ex.openssl).toContain('openssl s_client')
  })
})
