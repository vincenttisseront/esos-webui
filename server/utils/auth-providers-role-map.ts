import type { UserRole } from './types'

export type AuthMfaMode = 'off' | 'idp_required' | 'idp_preferred'

export interface OidcClaimMappingRule {
  match: { type: 'oidc_claim'; claim: string; contains: string }
  role:  UserRole
}

export interface LdapGroupMappingRule {
  match: { type: 'ldap_group_dn'; contains: string }
  role:  UserRole
}

export type AuthMappingRule = OidcClaimMappingRule | LdapGroupMappingRule

const ROLE_ORDER: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 }

export function parseAuthMappingRulesJson(raw: string | null | undefined): AuthMappingRule[] {
  if (!raw || raw.trim() === '') return []
  try {
    const v = JSON.parse(raw) as unknown
    if (!Array.isArray(v)) return []
    const out: AuthMappingRule[] = []
    for (const item of v) {
      if (!item || typeof item !== 'object') continue
      const m = (item as { match?: unknown; role?: string }).match
      const role = (item as { role?: string }).role
      if (!m || typeof m !== 'object' || !role) continue
      const mt = (m as { type?: string }).type
      if (mt === 'oidc_claim') {
        const claim = (m as { claim?: string }).claim
        const contains = (m as { contains?: string }).contains
        if (!claim || typeof contains !== 'string') continue
        if (role !== 'admin' && role !== 'operator' && role !== 'viewer') continue
        out.push({ match: { type: 'oidc_claim', claim, contains }, role })
      }
      if (mt === 'ldap_group_dn') {
        const contains = (m as { contains?: string }).contains
        if (typeof contains !== 'string') continue
        if (role !== 'admin' && role !== 'operator' && role !== 'viewer') continue
        out.push({ match: { type: 'ldap_group_dn', contains }, role })
      }
    }
    return out
  } catch {
    return []
  }
}

function claimValues(claims: Record<string, unknown>, claim: string): string[] {
  const v = claims[claim]
  if (v == null) return []
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

export function resolveRoleFromOidcClaims(
  claims: Record<string, unknown>,
  rules: AuthMappingRule[],
  defaultRole: UserRole,
  maxRole?: UserRole | null,
): UserRole {
  let best: UserRole = defaultRole
  let bestRank = ROLE_ORDER[defaultRole]
  for (const rule of rules) {
    if (rule.match.type !== 'oidc_claim') continue
    const vals = claimValues(claims, rule.match.claim)
    const hit = vals.some((s) => s.includes(rule.match.contains))
    if (!hit) continue
    const r = ROLE_ORDER[rule.role]
    if (r > bestRank) {
      best     = rule.role
      bestRank = r
    }
  }
  return maxRole ? capRole(best, maxRole) : best
}

export function resolveRoleFromLdapGroups(
  groupDns: string[],
  rules: AuthMappingRule[],
  defaultRole: UserRole,
  maxRole?: UserRole | null,
): UserRole {
  let best: UserRole = defaultRole
  let bestRank = ROLE_ORDER[defaultRole]
  for (const rule of rules) {
    if (rule.match.type !== 'ldap_group_dn') continue
    const hit = groupDns.some((dn) => dn.includes(rule.match.contains))
    if (!hit) continue
    const r = ROLE_ORDER[rule.role]
    if (r > bestRank) {
      best     = rule.role
      bestRank = r
    }
  }
  return maxRole ? capRole(best, maxRole) : best
}

export function capRole(role: UserRole, max: UserRole): UserRole {
  return ROLE_ORDER[role] > ROLE_ORDER[max] ? max : role
}

export function parseUserRole(s: string | null | undefined, fallback: UserRole): UserRole {
  if (s === 'admin' || s === 'operator' || s === 'viewer') return s
  return fallback
}
