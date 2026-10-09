/**
 * Resolve / JIT-provision a user from Bastion trusted header identity.
 */
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
import { parseAuthMappingRulesJson, parseUserRole, resolveRoleFromOidcClaims, capRole } from './auth-providers-role-map'
import type { UserRole } from './types'
import type { HeaderAuthIdentity } from './header-auth'

function sanitizeUsername(base: string): string {
  const s = base.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return (s.slice(0, 64) || 'user').toLowerCase()
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = sanitizeUsername(base)
  let n = 0
  while (await getUserByUsername(candidate)) {
    n += 1
    candidate = sanitizeUsername(`${base}_${n}`)
  }
  return candidate
}

export async function resolveHeaderLoginUser(params: {
  identity: HeaderAuthIdentity
  dto:      AdminAuthProvidersDto
}): Promise<UserRow> {
  const { identity, dto } = params
  const issuer = dto.header.issuer.trim()
  const subject = identity.username.trim()
  if (!issuer || !subject) {
    throw createError({ statusCode: 401, message: 'Identité header incomplète.' })
  }

  const rules = parseAuthMappingRulesJson(dto.auth.mappingRulesJson)
  const defaultRole = parseUserRole(dto.auth.jitDefaultRole, 'viewer')
  const maxCap = dto.auth.headerMaxRole
  const mappedRole = resolveRoleFromOidcClaims(identity.claims, rules, defaultRole, maxCap ?? undefined)
  const finalRole = maxCap ? capRole(mappedRole, maxCap) : mappedRole

  let user = await getUserByExternalIdentity(issuer, subject)
  if (user) {
    await touchExternalLogin(user.id)
    return user
  }

  const username = sanitizeUsername(identity.username)
  const byUsername = await getUserByUsername(username)
  if (byUsername) {
    if (byUsername.externalSubject && byUsername.externalSubject !== subject) {
      throw createError({
        statusCode: 403,
        message: 'Ce compte local est associé à un autre identifiant SSO.',
      })
    }
    if (byUsername.externalIssuer && byUsername.externalIssuer !== issuer) {
      throw createError({ statusCode: 403, message: 'Émetteur SSO incompatible pour ce compte.' })
    }
    if (!byUsername.externalSubject) {
      // Email from Bastion is considered verified (proxy-injected after IdP auth).
      linkUserToFederatedIdentity(byUsername.id, 'header', issuer, subject)
      const linked = await getUserById(byUsername.id)
      if (!linked) throw createError({ statusCode: 500, message: 'Erreur liaison compte' })
      await touchExternalLogin(linked.id)
      return linked
    }
  }

  if (!dto.auth.jitEnabled) {
    throw createError({
      statusCode: 403,
      message: 'Aucun compte correspondant. Activez le provisionnement JIT ou créez le compte.',
    })
  }

  const uname = await uniqueUsername(username)
  createJitExternalUser({
    username:        uname,
    displayName:     identity.displayName ?? identity.email ?? null,
    role:            finalRole as UserRole,
    active:          dto.auth.jitDefaultActive,
    authSource:      'header',
    externalIssuer:  issuer,
    externalSubject: subject,
    externalLogin:   identity.username,
    externalEmail:   identity.email ?? null,
  })
  const created = await getUserByExternalIdentity(issuer, subject)
  if (!created) throw createError({ statusCode: 500, message: 'Création compte header SSO échouée' })
  return created
}
