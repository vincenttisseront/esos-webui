import { describe, it, expect } from 'vitest'
import {
  buildLdapFailureDiagnostic,
  buildLdapTestConfigSummary,
  buildInitialStepResults,
  markStepOk,
  markStepFailed,
  buildLdapBindOnlySuccessDiagnostic,
  buildLdapUserNotFoundDiagnostic,
} from '../server/utils/ldap-diagnostics'
import {
  buildLdapTestSuggestions,
  buildStructuredLdapTestResponse,
  ldapSafeCodeToCategory,
} from '../server/utils/ldap-test-response'
import { buildUserSearchFilter } from '../server/utils/ldap-service'
import { ldapAdFullPreset } from '../server/utils/ldap-ad-defaults'

const baseLdap = {
  enabled:            true,
  url:                'ldaps://windc04.ar-systems.fr:636',
  startTls:           false,
  tlsVerify:          false,
  bindDn:             'svc_harbor@ar-systems.fr',
  bindPasswordSet:    true,
  baseDn:             'OU=AR-Users,DC=ar-systems,DC=fr',
  userSearchFilter:   '(&(objectCategory=person)(objectClass=user)(sAMAccountName={{username}}))',
  usernameAttribute:  'sAMAccountName',
  displayNameAttribute: 'displayName',
  groupAttribute:     'memberOf',
  timeoutSec:         10,
}

describe('ldap-test-response', () => {
  it('maps OperationsError to operationsError category', () => {
    expect(ldapSafeCodeToCategory('operations_error')).toBe('operationsError')
  })

  it('maps user_not_found to noResults, not operationsError', () => {
    expect(ldapSafeCodeToCategory('user_not_found')).toBe('noResults')
    expect(ldapSafeCodeToCategory('user_not_found')).not.toBe('operationsError')
  })

  it('bind-only diagnostic skips userSearch in progress', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, false)
    markStepOk(stepResults, 'connection')
    markStepOk(stepResults, 'starttls')
    markStepOk(stepResults, 'bind')
    const diagnostic = buildLdapBindOnlySuccessDiagnostic(baseLdap, config, stepResults)
    const structured = buildStructuredLdapTestResponse(
      { ok: true, bindOk: true, bindOnly: true, searchSampleCount: 0, diagnostic },
      baseLdap,
    )
    expect(structured.progress.userSearch).toBe('skipped')
    expect(structured.progress.bind).toBe('ok')
    expect(structured.bindOnly).toBe(true)
  })

  it('structured response sanitizes secrets in commands', () => {
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   'vincent.tisseront',
      userFilter: buildUserSearchFilter(baseLdap, 'vincent.tisseront'),
    })
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true)
    markStepOk(stepResults, 'connection')
    markStepOk(stepResults, 'starttls')
    markStepOk(stepResults, 'bind')
    markStepFailed(stepResults, 'userSearch')
    const diagnostic = buildLdapFailureDiagnostic(
      { name: 'OperationsError', message: 'Operations Error', lde_errno: 1 },
      'userSearch',
      baseLdap,
      config,
      stepResults,
    )
    const structured = buildStructuredLdapTestResponse({ ok: false, diagnostic }, baseLdap)
    expect(structured.commands?.ldapsearch).toContain('ldapsearch')
    expect(structured.commands?.ldapsearch).not.toMatch(/password/i)
    expect(structured.configTested.bindPrincipalMasked).not.toContain('secret')
    expect(structured.configTested.renderedFilter).toContain('vincent.tisseront')
    expect(structured.error?.category).toBe('operationsError')
    expect(structured.failedStep).toBe('userSearch')
  })

  it('suggests root base DN test first on operations error with nested OU', () => {
    const config = buildLdapTestConfigSummary(baseLdap)
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true)
    const diagnostic = buildLdapFailureDiagnostic(
      { name: 'OperationsError', lde_errno: 1, message: 'Operations Error' },
      'userSearch',
      baseLdap,
      config,
      stepResults,
    )
    const suggestions = buildLdapTestSuggestions(diagnostic, baseLdap)
    expect(suggestions[0]?.actionType).toBe('testRootBaseDn')
    expect(suggestions[0]?.payload?.baseDn).toBe('DC=ar-systems,DC=fr')
  })

  it('includes UPN bind payload in suggestions when derivable', () => {
    const config = buildLdapTestConfigSummary({
      ...baseLdap,
      bindDn: 'CN=svc_harbor,OU=Services,DC=ar-systems,DC=fr',
    })
    const diagnostic = buildLdapFailureDiagnostic(
      { name: 'OperationsError', lde_errno: 1, message: 'Operations Error' },
      'userSearch',
      { ...baseLdap, bindDn: 'CN=svc_harbor,OU=Services,DC=ar-systems,DC=fr' },
      config,
      buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true),
    )
    const suggestions = buildLdapTestSuggestions(diagnostic, {
      ...baseLdap,
      bindDn: 'CN=svc_harbor,OU=Services,DC=ar-systems,DC=fr',
    })
    const upn = suggestions.find((s) => s.key === 'try_upn_bind_format')
    expect(upn?.payload?.bindDn).toBe('svc_harbor@ar-systems.fr')
  })

  it('user not found returns noResults category', () => {
    const filter = buildUserSearchFilter(baseLdap, 'missing')
    const config = buildLdapTestConfigSummary(baseLdap, { username: 'missing', userFilter: filter })
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true)
    const diagnostic = buildLdapUserNotFoundDiagnostic(baseLdap, config, stepResults, filter)
    const structured = buildStructuredLdapTestResponse(
      { ok: true, bindOk: true, userLookup: false, searchSampleCount: 0, diagnostic },
      baseLdap,
    )
    expect(structured.error).toBeUndefined()
    expect(structured.result?.userFound).toBe(false)
  })
})

describe('ldapAdFullPreset', () => {
  it('generates AD preset from domain URL and nested base DN', () => {
    const preset = ldapAdFullPreset({
      url:    baseLdap.url,
      bindDn: baseLdap.bindDn,
      baseDn: baseLdap.baseDn,
    })
    expect(preset.domainFqdn).toBe('ar-systems.fr')
    expect(preset.baseDn).toBe('DC=ar-systems,DC=fr')
    expect(preset.userFilter).toContain('objectCategory=person')
    expect(preset.usernameAttribute).toBe('sAMAccountName')
    expect(preset.groupAttribute).toBe('memberOf')
  })
})
