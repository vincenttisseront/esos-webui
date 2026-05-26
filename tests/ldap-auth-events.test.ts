import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeLdapEventText,
  sanitizeLdapUsername,
  ldapUrlHostOnly,
  recordLdapAuthEventFromTest,
} from '../server/utils/ldap-auth-events'
import { formatLdapAuthEventForCopy } from '../utils/ldap-auth-events-format'
import {
  buildLdapFailureDiagnostic,
  buildLdapTestConfigSummary,
  buildInitialStepResults,
} from '../server/utils/ldap-diagnostics'

const insertMock = vi.fn().mockResolvedValue('event-id-1')

vi.mock('../server/db/repositories/ldap-auth-event.repository', () => ({
  insertLdapAuthEvent: (...args: unknown[]) => insertMock(...args),
  pruneLdapAuthEvents: vi.fn().mockResolvedValue(undefined),
  LDAP_AUTH_EVENT_RETENTION_DAYS: 30,
  LDAP_AUTH_EVENT_MAX_ROWS:       5000,
}))

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

describe('ldap-auth-events sanitization', () => {
  beforeEach(() => {
    insertMock.mockClear()
  })

  it('strips secret-like text', () => {
    expect(sanitizeLdapEventText('bind password=secret')).toBeNull()
    expect(sanitizeLdapUsername('normal.user')).toBe('normal.user')
  })

  it('ldapUrlHostOnly returns host without credentials', () => {
    expect(ldapUrlHostOnly('ldaps://windc04.ar-systems.fr:636')).toBe('windc04.ar-systems.fr:636')
    expect(ldapUrlHostOnly('ldap://user:pass@dc.example.com')).toBe('dc.example.com')
  })

  it('formatLdapAuthEventForCopy omits password fields', () => {
    const text = formatLdapAuthEventForCopy({
      id:                '1',
      at:                '2026-01-01T00:00:00.000Z',
      eventType:         'test',
      action:            'search',
      step:              'userSearch',
      result:            'failure',
      safeCode:          'operations_error',
      username:          'vincent.tisseront',
      provider:          'ldap',
      urlHost:           'windc04.ar-systems.fr',
      baseDn:            'DC=ar-systems,DC=fr',
      renderedFilter:    '(sAMAccountName=vincent.tisseront)',
      ldapErrorName:     'OperationsError',
      ldapErrorCode:     '1',
      diagnosticMessage: 'Operations Error',
      matchedDn:         null,
      referralsJson:     null,
      durationMs:        120,
      requestIp:         '10.0.0.1',
      userAgent:         null,
      stepResultsJson:   null,
    })
    expect(text).toContain('operations_error')
    expect(text).not.toMatch(/password/i)
  })
})

describe('ldap-auth-events persistence', () => {
  beforeEach(() => {
    insertMock.mockClear()
  })

  it('stores LDAP test event without password', async () => {
    const config = buildLdapTestConfigSummary(baseLdap, {
      username:   'vincent.tisseront',
      userFilter: '(&(objectClass=user)(sAMAccountName=vincent.tisseront))',
    })
    const diagnostic = buildLdapFailureDiagnostic(
      { name: 'OperationsError', lde_errno: 1, message: 'Operations Error' },
      'userSearch',
      baseLdap,
      config,
      buildInitialStepResults(baseLdap.url, baseLdap.startTls, true, true),
    )
    recordLdapAuthEventFromTest({
      action:     'search',
      diagnostic,
      dto:        baseLdap,
      lookupUser: 'vincent.tisseront',
      httpOk:     false,
      durationMs: 50,
      requestIp:  '127.0.0.1',
    })
    await new Promise((r) => setTimeout(r, 10))
    expect(insertMock).toHaveBeenCalled()
    const row = insertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(row.eventType).toBe('test')
    expect(row.action).toBe('search')
    expect(row.safeCode).toBe('operations_error')
    expect(row.urlHost).toBe('windc04.ar-systems.fr:636')
    expect(JSON.stringify(row)).not.toMatch(/password/i)
  })
})
