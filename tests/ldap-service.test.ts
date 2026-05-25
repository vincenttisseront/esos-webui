import { describe, it, expect } from 'vitest'
import { buildUserSearchFilter } from '../server/utils/ldap-service'
import {
  buildLdapBindOnlySuccessDiagnostic,
  buildInitialStepResults,
  buildLdapTestConfigSummary,
  buildLdapUserNotFoundDiagnostic,
  ldapUserSearchFilterTemplate,
} from '../server/utils/ldap-diagnostics'
import {
  domainRootDnFromDn,
  domainRootDnFromUrl,
  ldapAdRecommendedDefaults,
  suggestUpnBindFromDn,
} from '../server/utils/ldap-ad-defaults'

const baseLdap = {
  enabled:            true,
  url:                'ldaps://windc04.ar-systems.fr:636',
  startTls:           false,
  tlsVerify:          true,
  bindDn:             'CN=svc_harbor,OU=Services,OU=AR-Users,DC=ar-systems,DC=fr',
  bindPasswordSet:    true,
  baseDn:             'OU=AR-Users,DC=ar-systems,DC=fr',
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
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, false)
    const d = buildLdapBindOnlySuccessDiagnostic(baseLdap, config, stepResults)
    expect(d.safeCode).toBe('bind_ok')
    expect(d.step).toBe('bind')
    expect(d.config.userFilter).toContain('{{username}}')
    expect(d.stepResults.find((s) => s.step === 'userSearch')?.status).toBe('skipped')
  })

  it('user not found is distinct from LDAP operation error', () => {
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   'missing',
      userFilter: buildUserSearchFilter(baseLdap, 'missing'),
    })
    const stepResults = buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true)
    const d = buildLdapUserNotFoundDiagnostic(baseLdap, config, stepResults, config.userFilter)
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

describe('ldap-ad-defaults', () => {
  it('derives domain root from nested base DN', () => {
    expect(domainRootDnFromDn('OU=AR-Users,DC=ar-systems,DC=fr')).toBe('DC=ar-systems,DC=fr')
  })

  it('derives domain root from URL hostname', () => {
    expect(domainRootDnFromUrl('ldaps://windc04.ar-systems.fr:636')).toBe('DC=ar-systems,DC=fr')
  })

  it('suggests UPN bind from CN bind DN', () => {
    expect(suggestUpnBindFromDn('CN=svc_harbor,OU=Services,DC=ar-systems,DC=fr', 'DC=ar-systems,DC=fr'))
      .toBe('svc_harbor@ar-systems.fr')
  })

  it('returns AD recommended filter and base DN', () => {
    const d = ldapAdRecommendedDefaults({
      url:    baseLdap.url,
      bindDn: baseLdap.bindDn,
      baseDn: baseLdap.baseDn,
    })
    expect(d.recommendedFilter).toContain('objectCategory=person')
    expect(d.recommendedBaseDn).toBe('DC=ar-systems,DC=fr')
    expect(d.recommendedBindUpn).toBe('svc_harbor@ar-systems.fr')
  })
})
