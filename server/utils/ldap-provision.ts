/**
 * Admin LDAP user import / update (no JIT at login — explicit provisioning).
 */
import { createError } from 'h3'
import type { AdminAuthProvidersDto } from './auth-providers-config'
import {
  parseAuthMappingRulesJson,
  parseUserRole,
  resolveRoleFromLdapGroups,
  capRole,
  type AuthMappingRule,
} from './auth-providers-role-map'
import type { UserRole } from './types'
import {
  createJitExternalUser,
  getUserByExternalIdentity,
  getUserByUsername,
  linkUserToFederatedIdentity,
  uniqueUsernameForBase,
  updateProvisionedExternalUser,
} from '../db/repositories/user.repository'

export type ProvisionLdapUserInput = {
  dn:           string
  login:        string
  displayName?: string | null
  mail?:        string | null
  groups:       string[]
  esosUsername?: string
  role:         UserRole
  active?:      boolean
}

export type ProvisionRowResult =
  | { dn: string; status: 'imported' | 'updated'; userId: string }
  | { dn: string; status: 'failed'; code: string; message: string }

function applyLdapMaxRole(role: UserRole, maxRole: UserRole | null | undefined): UserRole {
  return maxRole ? capRole(role, maxRole) : role
}

const ROLE_ORDER: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 }

function matchedLdapRuleIndex(
  groupDns: string[],
  rules: AuthMappingRule[],
): number | null {
  let bestRank = -1
  let idx: number | null = null
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!
    if (rule.match.type !== 'ldap_group_dn') continue
    const hit = groupDns.some((dn) => dn.includes(rule.match.contains))
    if (!hit) continue
    const r = ROLE_ORDER[rule.role]
    if (r > bestRank) {
      bestRank = r
      idx      = i
    }
  }
  return idx
}

export function suggestRoleForLdapGroups(
  dto: AdminAuthProvidersDto,
  groupDns: string[],
): { role: UserRole; ruleIndex: number | null } {
  const rules       = parseAuthMappingRulesJson(dto.auth.mappingRulesJson)
  const defaultRole = parseUserRole(dto.auth.jitDefaultRole, 'viewer')
  const role        = resolveRoleFromLdapGroups(
    groupDns,
    rules,
    defaultRole,
    dto.auth.ldapMaxRole,
  )
  return { role, ruleIndex: matchedLdapRuleIndex(groupDns, rules) }
}

export async function provisionLdapUsers(
  dto: AdminAuthProvidersDto,
  users: ProvisionLdapUserInput[],
  createdBy: string | null,
): Promise<{ imported: number; updated: number; results: ProvisionRowResult[] }> {
  if (!dto.ldap.enabled) {
    throw createError({ statusCode: 400, message: 'LDAP est désactivé' })
  }
  if (!dto.ldap.url?.trim() || !dto.ldap.bindDn?.trim()) {
    throw createError({ statusCode: 400, message: 'Configuration LDAP incomplète' })
  }

  const issuer  = dto.ldap.url.trim()
  const results: ProvisionRowResult[] = []
  let imported  = 0
  let updated   = 0

  for (const row of users) {
    const dn = row.dn.trim()
    const login = row.login.trim()
    if (!dn || !login) {
      results.push({ dn, status: 'failed', code: 'invalid_row', message: 'DN ou identifiant manquant' })
      continue
    }

    const role   = applyLdapMaxRole(row.role, dto.auth.ldapMaxRole)
    const active = row.active ?? true

    try {
      const existing = await getUserByExternalIdentity(issuer, dn)
      if (existing) {
        await updateProvisionedExternalUser(existing.id, {
          displayName:   row.displayName ?? null,
          role,
          active,
          externalLogin: login,
          externalEmail: row.mail ?? null,
        })
        updated++
        results.push({ dn, status: 'updated', userId: existing.id })
        continue
      }

      const baseUsername = (row.esosUsername?.trim() || login).slice(0, 64)
      const byName = await getUserByUsername(baseUsername)
      if (byName) {
        if (byName.externalSubject && byName.externalSubject !== dn) {
          results.push({
            dn,
            status:  'failed',
            code:    'username_conflict',
            message: `Le nom d'utilisateur « ${baseUsername} » est déjà utilisé.`,
          })
          continue
        }
        if (!byName.externalSubject) {
          await linkUserToFederatedIdentity(byName.id, 'ldap', issuer, dn)
          await updateProvisionedExternalUser(byName.id, {
            displayName:   row.displayName ?? null,
            role,
            active,
            externalLogin: login,
            externalEmail: row.mail ?? null,
          })
          updated++
          results.push({ dn, status: 'updated', userId: byName.id })
          continue
        }
      }

      const username = await uniqueUsernameForBase(baseUsername)
      const id = createJitExternalUser({
        username,
        displayName:     row.displayName ?? null,
        role,
        active,
        authSource:      'ldap',
        externalIssuer:  issuer,
        externalSubject: dn,
        externalLogin:   login,
        externalEmail:   row.mail ?? null,
      })
      void createdBy
      imported++
      results.push({ dn, status: 'imported', userId: id })
    } catch (e) {
      results.push({
        dn,
        status:  'failed',
        code:    'error',
        message: (e as { message?: string }).message ?? 'Échec',
      })
    }
  }

  return { imported, updated, results }
}
