import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveLdapLoginUser } from '../server/utils/ldap-user-resolve'
import type { SearchRow } from '../server/utils/ldap-service'

const getUserByExternalIdentity = vi.fn()
const getLdapUserByExternalLogin = vi.fn()
const getUserByUsername = vi.fn()
const createJitExternalUser = vi.fn()
const getUserById = vi.fn()
const linkUserToFederatedIdentity = vi.fn()
const touchExternalLogin = vi.fn()

vi.mock('../server/db/repositories/user.repository', () => ({
  getUserByExternalIdentity: (...args: unknown[]) => getUserByExternalIdentity(...args),
  getLdapUserByExternalLogin: (...args: unknown[]) => getLdapUserByExternalLogin(...args),
  getUserByUsername: (...args: unknown[]) => getUserByUsername(...args),
  createJitExternalUser: (...args: unknown[]) => createJitExternalUser(...args),
  getUserById: (...args: unknown[]) => getUserById(...args),
  linkUserToFederatedIdentity: (...args: unknown[]) => linkUserToFederatedIdentity(...args),
  touchExternalLogin: (...args: unknown[]) => touchExternalLogin(...args),
}))

const ldapRow: SearchRow = {
  dn:          'CN=Vincent Tisseront,OU=Users,DC=ar-systems,DC=fr',
  displayName: 'Vincent Tisseront',
  groupDns:    [],
  groupAttrPresent: true,
  attributesPreview: {
    sAMAccountName: 'vincent.tisseront',
    mail:           'vincent.tisseront@ar-systems.fr',
  },
}

const dto = {
  ldap: {
    url:                'ldaps://dc.ar-systems.fr',
    baseDn:             'DC=ar-systems,DC=fr',
    usernameAttribute:  'sAMAccountName',
    userSearchFilter:   '(&(objectClass=user)(sAMAccountName={{username}}))',
    displayNameAttribute: 'displayName',
    groupAttribute:     'memberOf',
    enabled:            true,
    startTls:           false,
    tlsVerify:          true,
    bindDn:             'svc@ar-systems.fr',
    bindPasswordSet:    true,
    timeoutSec:         10,
  },
  auth: {
    jitEnabled:       false,
    jitDefaultRole:   'viewer',
    jitDefaultActive: true,
    mappingRulesJson: '[]',
    ldapMaxRole:      null,
  },
} as const

describe('resolveLdapLoginUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserByExternalIdentity.mockResolvedValue(undefined)
    getLdapUserByExternalLogin.mockResolvedValue(undefined)
    getUserByUsername.mockResolvedValue(undefined)
  })

  it('JIT disabled and user not imported => user_not_imported', async () => {
    await expect(
      resolveLdapLoginUser({
        ldapRow,
        loginName: 'ar-systems\\vincent.tisseront',
        dto:       dto as never,
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      data:       { safeCode: 'user_not_imported' },
    })
  })

  it('imported LDAP user by DN can login when JIT disabled', async () => {
    getUserByExternalIdentity.mockResolvedValue({
      id:       'u1',
      username: 'vincent.tisseront',
      active:   true,
      role:     'viewer',
      externalSubject: ldapRow.dn,
      externalIssuer:  dto.ldap.url,
    })

    const user = await resolveLdapLoginUser({
      ldapRow,
      loginName: 'ar-systems\\vincent.tisseront',
      dto:       dto as never,
    })

    expect(user.id).toBe('u1')
    expect(touchExternalLogin).toHaveBeenCalledWith('u1')
  })

  it('imported LDAP user matched by external_login when JIT disabled', async () => {
    getLdapUserByExternalLogin.mockResolvedValue({
      id:              'u2',
      username:        'vincent',
      active:          true,
      role:            'viewer',
      externalSubject: ldapRow.dn,
      externalIssuer:  dto.ldap.url,
      externalLogin:   'vincent.tisseront',
    })

    const user = await resolveLdapLoginUser({
      ldapRow,
      loginName: 'ar-systems\\vincent.tisseront',
      dto:       dto as never,
    })

    expect(user.id).toBe('u2')
    expect(getLdapUserByExternalLogin).toHaveBeenCalledWith(
      dto.ldap.url,
      'vincent.tisseront',
    )
  })
})
