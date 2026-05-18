import { createError } from 'h3'
import {
  getUserByUsername,
  getUserByExternalIdentity,
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

export async function resolveLdapLoginUser(params: {
  ldapRow:   SearchRow
  loginName: string
  dto:       AdminAuthProvidersDto
}): Promise<UserRow> {
  const { ldapRow, loginName, dto } = params
  const issuer  = dto.ldap.url.trim()
  const subject = ldapRow.dn

  let user = await getUserByExternalIdentity(issuer, subject)
  if (user) {
    await touchExternalLogin(user.id)
    return user
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
      message:    'Aucun compte correspondant. Activez le provisionnement JIT ou créez le compte.',
    })
  }

  const rules       = parseAuthMappingRulesJson(dto.auth.mappingRulesJson)
  const defaultRole = parseUserRole(dto.auth.jitDefaultRole, 'viewer')
  const maxCap      = dto.auth.ldapMaxRole
  const mappedRole  = resolveRoleFromLdapGroups(ldapRow.groupDns, rules, defaultRole, maxCap ?? undefined)
  const finalRole   = maxCap ? capRole(mappedRole, maxCap) : mappedRole

  let uname = loginName
  if (await getUserByUsername(uname)) {
    let n = 0
    while (await getUserByUsername(uname)) {
      n += 1
      const suffix = `_ldap${n}`
      uname = `${loginName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`
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
  })
  const created = await getUserByExternalIdentity(issuer, subject)
  if (!created) throw createError({ statusCode: 500, message: 'Création compte LDAP échouée' })
  return created
}
