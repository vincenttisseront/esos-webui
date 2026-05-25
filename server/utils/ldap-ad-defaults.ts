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

/** Suggest UPN bind from CN=svc,…,DC=corp,DC=local → svc@corp.local */
export function suggestUpnBindFromDn(bindDn: string, domainRoot: string | null): string | null {
  const fqdn = fqdnFromDomainRoot(domainRoot)
  if (!fqdn) return null
  const cnMatch = bindDn.match(/^cn=([^,]+)/i)
  if (!cnMatch?.[1]) return null
  const sam = cnMatch[1].trim()
  if (!sam || sam.includes('@')) return null
  return `${sam}@${fqdn}`
}

export function ldapAdRecommendedDefaults(params: {
  url:    string
  bindDn: string
  baseDn: string
}): LdapAdRecommendedDefaults {
  const fromBase = domainRootDnFromDn(params.baseDn)
  const fromUrl  = domainRootDnFromUrl(params.url)
  const domainRoot = fromBase ?? fromUrl
  const domainFqdn = fqdnFromDomainRoot(domainRoot)
  const recommendedBindUpn = params.bindDn.includes('@')
    ? params.bindDn.trim()
    : suggestUpnBindFromDn(params.bindDn.trim(), domainRoot)

  return {
    recommendedFilter: AD_USER_FILTER,
    recommendedBaseDn: domainRoot,
    recommendedBindUpn,
    domainFqdn,
  }
}
