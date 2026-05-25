/**
 * Active Directory recommended defaults derived from URL / DN hints.
 * No secrets; safe for admin UI.
 */

export type LdapAdRecommendedDefaults = {
  recommendedFilter:    string
  recommendedBaseDn:    string | null
  recommendedBindUpn:   string | null
  domainFqdn:           string | null
}

export type LdapAdFullPreset = {
  domainFqdn:           string | null
  baseDn:               string | null
  userFilter:           string
  usernameAttribute:    string
  displayNameAttribute: string
  groupAttribute:       string
  bindUpn:              string | null
  bindNetbios:          string | null
}

const AD_USER_FILTER
  = '(&(objectCategory=person)(objectClass=user)(sAMAccountName={{username}}))'

/** Extract DC=… components from a DN string. */
export function domainRootDnFromDn(dn: string): string | null {
  const parts = dn
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^dc=/i.test(p))
  if (parts.length === 0) return null
  return parts.join(',')
}

/** Guess domain root from LDAP URL hostname (e.g. windc04.ar-systems.fr → DC=ar-systems,DC=fr). */
export function domainRootDnFromUrl(urlStr: string): string | null {
  const trimmed = urlStr.trim()
  if (!trimmed) return null
  const normalized = trimmed.includes('://') ? trimmed : `ldap://${trimmed}`
  try {
    const host = new URL(normalized).hostname.toLowerCase()
    const labels = host.split('.').filter(Boolean)
    if (labels.length < 2) return null
    const domainLabels = labels.slice(-2)
    return domainLabels.map((l) => `DC=${l}`).join(',')
  } catch {
    return null
  }
}

function fqdnFromDomainRoot(domainRoot: string | null): string | null {
  if (!domainRoot) return null
  const labels = domainRoot
    .split(',')
    .map((p) => p.trim())
    .filter((p) => /^dc=/i.test(p))
    .map((p) => p.slice(3))
  return labels.length >= 2 ? labels.join('.') : null
}

function netbiosFromDomainRoot(domainRoot: string | null): string | null {
  const fqdn = fqdnFromDomainRoot(domainRoot)
  if (!fqdn) return null
  const first = fqdn.split('.')[0]
  return first ? first.toUpperCase() : null
}

function samAccountFromBind(bindDn: string): string | null {
  const s = bindDn.trim()
  if (!s) return null
  if (s.includes('@')) return s.split('@')[0] ?? null
  if (s.includes('\\')) return s.split('\\').pop() ?? null
  const cn = s.match(/^cn=([^,]+)/i)?.[1]
  return cn?.trim() || null
}

/** Suggest UPN bind from CN=svc,…,DC=corp,DC=local → svc@corp.local */
export function suggestUpnBindFromDn(bindDn: string, domainRoot: string | null): string | null {
  const fqdn = fqdnFromDomainRoot(domainRoot)
  if (!fqdn) return null
  const sam = samAccountFromBind(bindDn)
  if (!sam || sam.includes('@')) return null
  return `${sam}@${fqdn}`
}

export function suggestNetbiosBindFromDn(bindDn: string, domainRoot: string | null): string | null {
  const netbios = netbiosFromDomainRoot(domainRoot)
  const sam = samAccountFromBind(bindDn)
  if (!netbios || !sam) return null
  return `${netbios}\\${sam}`
}

export function ldapAdRecommendedDefaults(params: {
  url:    string
  bindDn: string
  baseDn: string
}): LdapAdRecommendedDefaults {
  const preset = ldapAdFullPreset(params)
  return {
    recommendedFilter:  preset.userFilter,
    recommendedBaseDn:  preset.baseDn,
    recommendedBindUpn: preset.bindUpn,
    domainFqdn:         preset.domainFqdn,
  }
}

export function ldapAdFullPreset(params: {
  url:    string
  bindDn: string
  baseDn: string
}): LdapAdFullPreset {
  const fromBase = domainRootDnFromDn(params.baseDn)
  const fromUrl  = domainRootDnFromUrl(params.url)
  const domainRoot = fromBase ?? fromUrl
  const domainFqdn = fqdnFromDomainRoot(domainRoot)
  const bindUpn = params.bindDn.includes('@')
    ? params.bindDn.trim()
    : suggestUpnBindFromDn(params.bindDn.trim(), domainRoot)

  return {
    domainFqdn,
    baseDn:               domainRoot,
    userFilter:           AD_USER_FILTER,
    usernameAttribute:    'sAMAccountName',
    displayNameAttribute: 'displayName',
    groupAttribute:       'memberOf',
    bindUpn,
    bindNetbios:          suggestNetbiosBindFromDn(params.bindDn, domainRoot),
  }
}
