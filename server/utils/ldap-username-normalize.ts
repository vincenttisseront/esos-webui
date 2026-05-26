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

const FILTER_PLACEHOLDER_KEYS = [
  'username',
  'accountName',
  'userPrincipalName',
  'domainPrefix',
] as const

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
  const rawUsername = raw.trim()
  if (!rawUsername) {
    return {
      rawUsername:  '',
      accountName:  '',
      userPrincipalName: null,
      domainPrefix: null,
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

/** Remove attribute assertions left empty after placeholder substitution. */
export function pruneEmptyLdapFilterClauses(filter: string): string {
  return filter.replace(/\([A-Za-z][\w.-]*=\)/g, '')
}

export function renderUserSearchFilter(
  filterTemplate: string,
  usernameAttribute: string,
  identity: NormalizedLdapLogin,
): string {
  const template = filterTemplate.trim()
  const hasPlaceholder = FILTER_PLACEHOLDER_KEYS.some((key) => template.includes(`{{${key}}}`))

  const escaped: Record<(typeof FILTER_PLACEHOLDER_KEYS)[number], string> = {
    username:            escapeLdapFilterValue(identity.rawUsername),
    accountName:         escapeLdapFilterValue(identity.accountName),
    userPrincipalName:   identity.userPrincipalName
      ? escapeLdapFilterValue(identity.userPrincipalName)
      : '',
    domainPrefix:        identity.domainPrefix
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

export function filterTemplateHasLoginPlaceholder(filter: string): boolean {
  const f = filter.trim()
  return FILTER_PLACEHOLDER_KEYS.some((key) => f.includes(`{{${key}}}`))
}
