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

function sanitizeUsername(base: string): string {
  const s = base.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return (s.slice(0, 64) || 'user').toLowerCase()
}

export function suggestUsernameFromOidc(sub: string, email?: string, preferred?: string): string {
  const raw = preferred?.trim() || email?.split('@')[0]?.trim() || sub
  return sanitizeUsername(raw)
}

/**
 * OIDC auto-link to an existing row (sans externalSubject) uniquement si l’IdP atteste
 * une adresse e-mail vérifiée — évite la prise de compte via claims non fiables.
 */
export function oidcClaimsAllowAutoLinkToExistingAccount(claims: Record<string, unknown>): boolean {
  const v = claims.email_verified
  if (v === true) return true
  if (v === 'true') return true
  return false
}

export async function resolveOidcLoginUser(params: {
  issuer:        string
  subject:       string
  claims:        Record<string, unknown>
  dto:           AdminAuthProvidersDto
}): Promise<UserRow> {
  const { issuer, subject, claims, dto } = params

  const rules = parseAuthMappingRulesJson(dto.auth.mappingRulesJson)
  const defaultRole = parseUserRole(dto.auth.jitDefaultRole, 'viewer')
  const maxCap      = dto.auth.oidcMaxRole
  const mappedRole  = resolveRoleFromOidcClaims(claims, rules, defaultRole, maxCap ?? undefined)
  const finalRole   = maxCap ? capRole(mappedRole, maxCap) : mappedRole

  let user = await getUserByExternalIdentity(issuer, subject)
  if (user) {
    await touchExternalLogin(user.id)
    return user
  }

  const email      = typeof claims.email === 'string' ? claims.email : undefined
  const pref       = typeof claims.preferred_username === 'string' ? claims.preferred_username : undefined
  const username   = suggestUsernameFromOidc(subject, email, pref)

  const byUsername = await getUserByUsername(username)
  if (byUsername) {
    if (byUsername.externalSubject && byUsername.externalSubject !== subject) {
      throw createError({
        statusCode: 403,
        message:    'Ce compte local est associé à un autre identifiant OIDC.',
      })
    }
    if (byUsername.externalIssuer && byUsername.externalIssuer !== issuer) {
      throw createError({ statusCode: 403, message: 'Émetteur OIDC incompatible pour ce compte.' })
    }
    if (!byUsername.externalSubject && oidcClaimsAllowAutoLinkToExistingAccount(claims)) {
      linkUserToFederatedIdentity(byUsername.id, 'oidc', issuer, subject)
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

  const uname = await uniqueUsername(username)
  createJitExternalUser({
    username:        uname,
    displayName:     typeof claims.name === 'string' ? claims.name : pref ?? null,
    role:            finalRole as UserRole,
    active:          dto.auth.jitDefaultActive,
    authSource:      'oidc',
    externalIssuer:  issuer,
    externalSubject: subject,
  })
  const created = await getUserByExternalIdentity(issuer, subject)
  if (!created) throw createError({ statusCode: 500, message: 'Création compte OIDC échouée' })
  return created
}

async function uniqueUsername(base: string): Promise<string> {
  let u = base
  let n = 0
  while (await getUserByUsername(u)) {
    n += 1
    const suffix = `_${n}`
    u = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`
  }
  return u
}
