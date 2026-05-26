import type { AdminAuthProvidersDto } from './auth-providers-config'
import { escapeLdapFilterValue } from './ldap-filter-escape'
import { domainRootDnFromDn, domainRootDnFromUrl } from './ldap-ad-defaults'

export type NormalizedLdapLogin = {
  /** Trimmed sign-in input as entered. */
  rawUsername: string
  /** sAMAccountName-style local part (no domain prefix or UPN suffix). */
  accountName: string
  /** Full UPN when input is user@domain, or synthesized for plain user when a domain suffix is known. */
  userPrincipalName: string | null
  /** NetBIOS / domain prefix from DOMAIN\\user, if present. */
  domainPrefix: string | null
}

/** Alias for provisioning, login, and LDAP test search. */
export type NormalizedLdapLoginIdentity = NormalizedLdapLogin

const FILTER_PLACEHOLDER_KEYS = [
  'username',
  'accountName',
  'userPrincipalName',
  'domainPrefix',
] as const

export type RenderLdapUserFilterOptions = {
  /**
   * Sign-in and exact user lookup: map legacy {{username}} to normalized accountName.
   * Template preview / literal legacy behavior: false.
   */
  normalizeLegacyUsernamePlaceholder?: boolean
}

/** FQDN derived from LDAP base DN or URL (e.g. ar-systems.fr). */
export function ldapDefaultUpnSuffix(url: string, baseDn: string): string | null {
  const root = domainRootDnFromDn(baseDn.trim()) ?? domainRootDnFromUrl(url.trim())
  if (!root) return null
  const labels = root
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^dc=/i.test(p))
    .map((p) => p.slice(3))
  return labels.length >= 2 ? labels.join('.') : null
}

/**
 * Parse common Active Directory sign-in formats before LDAP search.
 */
export function normalizeLdapLoginUsername(
  raw: string,
  options?: { defaultUpnSuffix?: string | null },
): NormalizedLdapLogin {
  return normalizeLdapLoginIdentifier(raw, options)
}

/** @alias normalizeLdapLoginUsername */
export function normalizeLdapLoginIdentifier(
  raw: string,
  options?: { defaultUpnSuffix?: string | null },
): NormalizedLdapLoginIdentity {
  const rawUsername = raw.trim()
  if (!rawUsername) {
    return {
      rawUsername:       '',
      accountName:       '',
      userPrincipalName: null,
      domainPrefix:      null,
    }
  }

  const backslash = rawUsername.indexOf('\\')
  if (backslash >= 0) {
    const domainPrefix = rawUsername.slice(0, backslash).trim() || null
    const accountName = rawUsername.slice(backslash + 1).trim() || rawUsername
    return {
      rawUsername,
      accountName,
      userPrincipalName: null,
      domainPrefix,
    }
  }

  const at = rawUsername.indexOf('@')
  if (at > 0 && at < rawUsername.length - 1) {
    const accountName = rawUsername.slice(0, at).trim()
    return {
      rawUsername,
      accountName: accountName || rawUsername,
      userPrincipalName: rawUsername,
      domainPrefix: null,
    }
  }

  const accountName = rawUsername
  const suffix = options?.defaultUpnSuffix?.trim()
  const userPrincipalName = suffix ? `${accountName}@${suffix}` : null
  return {
    rawUsername,
    accountName,
    userPrincipalName,
    domainPrefix: null,
  }
}

export function resolveLdapLoginIdentity(
  raw: string,
  ldap: Pick<AdminAuthProvidersDto['ldap'], 'url' | 'baseDn'>,
): NormalizedLdapLoginIdentity {
  return normalizeLdapLoginIdentifier(raw, {
    defaultUpnSuffix: ldapDefaultUpnSuffix(ldap.url ?? '', ldap.baseDn ?? ''),
  })
}

/** Remove attribute assertions left empty after placeholder substitution. */
export function pruneEmptyLdapFilterClauses(filter: string): string {
  return filter.replace(/\([A-Za-z][\w.-]*=\)/g, '')
}

export function renderLdapUserFilter(
  filterTemplate: string,
  usernameAttribute: string,
  identity: NormalizedLdapLoginIdentity,
  options?: RenderLdapUserFilterOptions,
): string {
  const normalizeLegacy = options?.normalizeLegacyUsernamePlaceholder !== false
  const template = filterTemplate.trim()
  const hasPlaceholder = FILTER_PLACEHOLDER_KEYS.some((key) => template.includes(`{{${key}}}`))

  const usernameValue = normalizeLegacy
    ? identity.accountName
    : identity.rawUsername

  const escaped: Record<(typeof FILTER_PLACEHOLDER_KEYS)[number], string> = {
    username:          escapeLdapFilterValue(usernameValue),
    accountName:       escapeLdapFilterValue(identity.accountName),
    userPrincipalName: identity.userPrincipalName
      ? escapeLdapFilterValue(identity.userPrincipalName)
      : '',
    domainPrefix: identity.domainPrefix
      ? escapeLdapFilterValue(identity.domainPrefix)
      : '',
  }

  if (hasPlaceholder) {
    let out = template
    for (const key of FILTER_PLACEHOLDER_KEYS) {
      out = out.split(`{{${key}}}`).join(escaped[key])
    }
    return pruneEmptyLdapFilterClauses(out)
  }

  const attr = usernameAttribute.trim() || 'sAMAccountName'
  return `(&${template}(${attr}=${escaped.accountName}))`
}

/** @alias renderLdapUserFilter */
export const renderUserSearchFilter = renderLdapUserFilter

export function buildLdapUserSearchFilter(
  ldap: Pick<AdminAuthProvidersDto['ldap'], 'userSearchFilter' | 'usernameAttribute' | 'url' | 'baseDn'>,
  rawInput: string,
): string {
  const identity = resolveLdapLoginIdentity(rawInput, ldap)
  return renderLdapUserFilter(
    ldap.userSearchFilter,
    ldap.usernameAttribute?.trim() || 'sAMAccountName',
    identity,
    { normalizeLegacyUsernamePlaceholder: true },
  )
}

export function filterTemplateHasLoginPlaceholder(filter: string): boolean {
  const f = filter.trim()
  return FILTER_PLACEHOLDER_KEYS.some((key) => f.includes(`{{${key}}}`))
}

/** Safe admin log fields (no password). */
export function ldapLoginIdentityDiagnosticMessage(
  identity: NormalizedLdapLoginIdentity,
): string {
  const parts = [
    `rawUsername=${identity.rawUsername}`,
    `accountName=${identity.accountName}`,
  ]
  if (identity.userPrincipalName) {
    parts.push(`userPrincipalName=${identity.userPrincipalName}`)
  }
  if (identity.domainPrefix) {
    parts.push(`domainPrefix=${identity.domainPrefix}`)
  }
  return parts.join('; ')
}
