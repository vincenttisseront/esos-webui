/**
 * LDAP directory browse for admin provisioning (safe filters, ESOS status enrichment).
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'
import { escapeLdapFilterValue } from './ldap-filter-escape'
import { resolveLdapLoginIdentity } from './ldap-username-normalize'
import { runLdapDirectorySearch, type SearchRow } from './ldap-service'
import type { UserRole } from './types'
import {
  getUserByExternalIdentity,
  listLdapUsersByIssuer,
  type ProvisionedLdapUserRow,
} from '../db/repositories/user.repository'

export type LdapDirectoryUserStatus = 'not_imported' | 'imported' | 'imported_inactive'

export type LdapDirectoryUser = {
  dn:           string
  login:        string
  displayName:  string | null
  mail:         string | null
  groups:       string[]
  esosStatus:   LdapDirectoryUserStatus
  esosUserId?:  string
  esosUsername?: string
  esosRole?:    UserRole
}

export function buildDirectorySearchFilter(
  dto: AdminAuthProvidersDto['ldap'],
  query: string,
): string {
  const identity = resolveLdapLoginIdentity(query, dto)
  const escAccount = escapeLdapFilterValue(identity.accountName)
  const loginAttr    = dto.usernameAttribute?.trim() || 'sAMAccountName'
  const displayAttr  = dto.displayNameAttribute?.trim() || 'displayName'
  const clauses = [
    `(${loginAttr}=*${escAccount}*)`,
    `(${displayAttr}=*${escAccount}*)`,
    `(mail=*${escAccount}*)`,
  ]
  if (identity.userPrincipalName && identity.userPrincipalName !== identity.accountName) {
    const escUpn = escapeLdapFilterValue(identity.userPrincipalName)
    clauses.push(`(userPrincipalName=*${escUpn}*)`)
  }
  return `(&(objectCategory=person)(objectClass=user)(|${clauses.join('')}))`
}

function loginFromRow(row: SearchRow, loginAttr: string): string {
  const preview = row.attributesPreview ?? {}
  const v = preview[loginAttr]
  if (typeof v === 'string' && v) return v
  const cn = row.dn.match(/^cn=([^,]+)/i)?.[1]
  return cn?.trim() || row.dn
}

function mailFromRow(row: SearchRow): string | null {
  const v = row.attributesPreview?.mail
  return typeof v === 'string' && v ? v : null
}

function mapEsosStatus(
  existing: ProvisionedLdapUserRow | undefined,
): LdapDirectoryUserStatus {
  if (!existing) return 'not_imported'
  return existing.active ? 'imported' : 'imported_inactive'
}

export function mapSearchRowsToDirectoryUsers(
  rows: SearchRow[],
  ldap: AdminAuthProvidersDto['ldap'],
  provisioned: ProvisionedLdapUserRow[],
): LdapDirectoryUser[] {
  const loginAttr = ldap.usernameAttribute?.trim() || 'sAMAccountName'
  const byDn      = new Map(provisioned.map((u) => [u.dn.toLowerCase(), u]))

  return rows.map((row) => {
    const existing = byDn.get(row.dn.toLowerCase())
    return {
      dn:          row.dn,
      login:       loginFromRow(row, loginAttr),
      displayName: row.displayName,
      mail:        mailFromRow(row),
      groups:      [...row.groupDns],
      esosStatus:  mapEsosStatus(existing),
      ...(existing
        ? {
            esosUserId:   existing.id,
            esosUsername: existing.username,
            esosRole:     existing.role,
          }
        : {}),
    }
  })
}

export async function searchLdapDirectory(params: {
  dto:          AdminAuthProvidersDto
  bindPassword: string
  query:        string
  limit?:       number
}): Promise<{ users: LdapDirectoryUser[]; groups: string[] }> {
  const filter = buildDirectorySearchFilter(params.dto.ldap, params.query)
  const limit  = params.limit ?? 25
  const rows   = await runLdapDirectorySearch(
    params.dto.ldap,
    params.bindPassword,
    filter,
    limit,
  )
  const issuer      = params.dto.ldap.url.trim()
  const provisioned = await listLdapUsersByIssuer(issuer)
  const users       = mapSearchRowsToDirectoryUsers(rows, params.dto, provisioned)

  const groupSet = new Set<string>()
  for (const u of users) {
    for (const g of u.groups) groupSet.add(g)
  }

  return {
    users,
    groups: [...groupSet].sort((a, b) => a.localeCompare(b)),
  }
}

export async function findProvisionedByDn(
  issuer: string,
  dn: string,
): Promise<ProvisionedLdapUserRow | undefined> {
  const user = await getUserByExternalIdentity(issuer, dn)
  if (!user || user.authSource !== 'ldap') return undefined
  return {
    id:            user.id,
    username:      user.username,
    displayName:   user.displayName ?? null,
    role:          user.role as UserRole,
    active:        user.active,
    externalLogin: user.externalLogin ?? null,
    externalEmail: user.externalEmail ?? null,
    dn:            user.externalSubject ?? dn,
    lastLoginAt:   user.lastLoginAt ?? null,
  }
}
