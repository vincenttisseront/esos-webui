import { createError } from 'h3'
import {
  getUserByUsername,
  getUserByExternalIdentity,
  getLdapUserByExternalLogin,
  createJitExternalUser,
  getUserById,
  linkUserToFederatedIdentity,
  touchExternalLogin,
  type UserRow,
} from '../db/repositories/user.repository'
import type { AdminAuthProvidersDto } from './auth-providers-config'
import {
  parseAuthMappingRulesJson,
  parseUserRole,
  resolveRoleFromLdapGroups,
  capRole,
} from './auth-providers-role-map'
import type { UserRole } from './types'
import type { SearchRow } from './ldap-service'
import { resolveLdapLoginIdentity } from './ldap-username-normalize'

function ldapAccountNameFromRow(
  ldapRow: SearchRow,
  ldap: AdminAuthProvidersDto['ldap'],
  loginName: string,
): string {
  const loginAttr = ldap.usernameAttribute?.trim() || 'sAMAccountName'
  const fromAttr  = ldapRow.attributesPreview?.[loginAttr]
  if (typeof fromAttr === 'string' && fromAttr.trim()) return fromAttr.trim()
  return resolveLdapLoginIdentity(loginName, ldap).accountName
}

export async function resolveLdapLoginUser(params: {
  ldapRow:   SearchRow
  loginName: string
  dto:       AdminAuthProvidersDto
}): Promise<UserRow> {
  const { ldapRow, loginName, dto } = params
  const issuer      = dto.ldap.url.trim()
  const subject     = ldapRow.dn
  const accountName = ldapAccountNameFromRow(ldapRow, dto.ldap, loginName)

  let user = await getUserByExternalIdentity(issuer, subject)
  if (user) {
    await touchExternalLogin(user.id)
    return user
  }

  const byExternalLogin = await getLdapUserByExternalLogin(issuer, accountName)
  if (byExternalLogin) {
    if (byExternalLogin.externalSubject && byExternalLogin.externalSubject !== subject) {
      throw createError({
        statusCode: 403,
        message:    'Ce compte est associé à un autre utilisateur LDAP.',
        data:       { code: 'ldap.identity_conflict', safeCode: 'identity_conflict' },
      })
    }
    if (!byExternalLogin.externalSubject) {
      linkUserToFederatedIdentity(byExternalLogin.id, 'ldap', issuer, subject)
      const linked = await getUserById(byExternalLogin.id)
      if (!linked) throw createError({ statusCode: 500, message: 'Erreur liaison compte' })
      await touchExternalLogin(linked.id)
      return linked
    }
    await touchExternalLogin(byExternalLogin.id)
    return byExternalLogin
  }

  const byUsername = await getUserByUsername(loginName)
  if (byUsername) {
    if (byUsername.externalSubject && byUsername.externalSubject !== subject) {
      throw createError({
        statusCode: 403,
        message:    'Ce compte est associé à un autre annuaire LDAP.',
      })
    }
    if (byUsername.externalIssuer && byUsername.externalIssuer !== issuer) {
      throw createError({ statusCode: 403, message: 'Serveur LDAP incompatible pour ce compte.' })
    }
    if (!byUsername.externalSubject) {
      linkUserToFederatedIdentity(byUsername.id, 'ldap', issuer, subject)
      const linked = await getUserById(byUsername.id)
      if (!linked) throw createError({ statusCode: 500, message: 'Erreur liaison compte' })
      await touchExternalLogin(linked.id)
      return linked
    }
  }

  if (!dto.auth.jitEnabled) {
    throw createError({
      statusCode: 403,
      message:    'Identifiants incorrects',
      data:       { code: 'ldap.user_not_imported', safeCode: 'user_not_imported' },
    })
  }

  const rules       = parseAuthMappingRulesJson(dto.auth.mappingRulesJson)
  const defaultRole = parseUserRole(dto.auth.jitDefaultRole, 'viewer')
  const maxCap      = dto.auth.ldapMaxRole
  const mappedRole  = resolveRoleFromLdapGroups(ldapRow.groupDns, rules, defaultRole, maxCap ?? undefined)
  const finalRole   = maxCap ? capRole(mappedRole, maxCap) : mappedRole

  let uname = accountName
  if (await getUserByUsername(uname)) {
    let n = 0
    while (await getUserByUsername(uname)) {
      n += 1
      const suffix = `_ldap${n}`
      uname = `${accountName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`
    }
  }

  createJitExternalUser({
    username:        uname,
    displayName:     ldapRow.displayName,
    role:            finalRole as UserRole,
    active:          dto.auth.jitDefaultActive,
    authSource:      'ldap',
    externalIssuer:  issuer,
    externalSubject: subject,
    externalLogin:   accountName,
  })
  const created = await getUserByExternalIdentity(issuer, subject)
  if (!created) throw createError({ statusCode: 500, message: 'Création compte LDAP échouée' })
  return created
}
