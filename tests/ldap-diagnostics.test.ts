import { describe, it, expect } from 'vitest'
import {
  maskBindPrincipal,
  buildLdapTestConfigSummary,
  buildLdapFailureDiagnostic,
  buildLdapValidationFailure,
  buildLdapCommandExamples,
  formatLdapDiagnosticForCopy,
  buildInitialStepResults,
  markStepFailed,
  markStepOk,
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

  it('maps Operations Error to operations_error with AD hints on userSearch', () => {
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   'alice',
      userFilter: '(&(objectClass=user)(sAMAccountName=alice))',
    })
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true)
    markStepOk(stepResults, 'connection')
    markStepOk(stepResults, 'starttls')
    markStepOk(stepResults, 'bind')
    markStepFailed(stepResults, 'userSearch')
    const d = buildLdapFailureDiagnostic(
      { name: 'OperationsError', message: 'Operations Error', lde_errno: 1, lde_message: '00002020' },
      'userSearch',
      baseLdap,
      config,
      stepResults,
    )
    expect(d.safeCode).toBe('operations_error')
    expect(d.step).toBe('userSearch')
    expect(d.hints).toContain('try_domain_root_base_dn')
    expect(d.hints).toContain('try_upn_bind_format')
    expect(d.hints).toContain('check_filter_syntax')
    expect(d.stepResults.find((s) => s.step === 'bind')?.status).toBe('ok')
    expect(d.commandExamples?.openssl).toContain('openssl s_client')
  })

  it('maps referral LDAP error', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, false)
    const d = buildLdapFailureDiagnostic(
      { name: 'Referral', lde_errno: 10, message: 'Referral ldap://other.dc.example.com' },
      'userSearch',
      baseLdap,
      config,
      stepResults,
    )
    expect(d.safeCode).toBe('referral')
    expect(d.referrals?.length).toBeGreaterThan(0)
    expect(d.hints).toContain('referrals_not_followed')
  })

  it('validation failure for missing bind password', () => {
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, false)
    const r = buildLdapValidationFailure(
      'bind',
      'bind_password_missing',
      { ...baseLdap, bindPasswordSet: false },
      buildLdapTestConfigSummary({ ...baseLdap, bindPasswordSet: false }),
      stepResults,
    )
    expect(r.ok).toBe(false)
    expect(r.diagnostic.safeCode).toBe('bind_password_missing')
    expect(r.diagnostic.stepResults.length).toBeGreaterThan(0)
  })

  it('formatLdapDiagnosticForCopy omits secrets', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, false)
    const d = buildLdapFailureDiagnostic(
      new Error('Operations Error'),
      'bind',
      baseLdap,
      config,
      stepResults,
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
