/**
 * Pure helpers for the admin Auth Providers page (warnings, previews, JSON check).
 * Safe to import from Vitest without Nitro.
 *
 * User-visible copy is resolved in Vue via i18n keys under `admin.authProviders.*`
 * using stable ids returned by these helpers.
 */
import {
  parseAuthMappingRulesJson,
  resolveRoleFromLdapGroups,
  resolveRoleFromOidcClaims,
  type AuthMappingRule,
} from '../server/utils/auth-providers-role-map'
import type { UserRole } from '../server/utils/types'
import {
  evaluateLdapAvailability,
  evaluateOidcAvailability,
  isLdapConfigSufficientForLogin,
  isOidcConfigSufficientForLogin,
  type PublicProviderReasonCode,
} from '../server/utils/auth-providers-public'
import type { AdminAuthProvidersDto } from '../server/utils/auth-providers-config'
import type { LdapTestDiagnostic, LdapTestConfigSummary } from '../server/utils/ldap-diagnostics'

export type { LdapTestDiagnostic }

export type AuthProviderTabId = 'local' | 'ldap' | 'oidc' | 'roles' | 'security'

export const AUTH_PROVIDERS_TAB_STORAGE_KEY = 'auth-providers-active-tab'

export type LdapTestClientState =
  | { ok: true; searchSampleCount: number; userLookup?: boolean; bindOnly?: boolean; diagnostic: LdapTestDiagnostic }
  | { ok: false; error: string; diagnostic: LdapTestDiagnostic }
  | null

export type LdapTestApiResponse = {
  ok:                 boolean
  searchSampleCount?: number
  bindOnly?:          boolean
  userLookup?:        boolean
  error?:             string
  diagnostic?:        LdapTestDiagnostic
}

export function mapLdapTestApiResponse(
  r: LdapTestApiResponse,
): LdapTestClientState | null {
  if (!r.diagnostic) return null
  if (r.ok) {
    return {
      ok:                true,
      searchSampleCount: r.searchSampleCount ?? 0,
      diagnostic:        r.diagnostic,
      ...(r.bindOnly ? { bindOnly: true } : {}),
      ...(r.userLookup !== undefined ? { userLookup: r.userLookup } : {}),
    }
  }
  return {
    ok:         false,
    error:      r.error ?? r.diagnostic.safeMessage,
    diagnostic: r.diagnostic,
  }
}

export function ldapTestClientNetworkFailure(
  message: string,
  config: LdapTestConfigSummary,
): LdapTestClientState {
  return {
    ok:         false,
    error:      message,
    diagnostic: {
      step:        'connection',
      safeCode:    'connection_failed',
      safeMessage: message,
      config,
      hints:       ['verify_timeout', 'check_tls_certificate', 'use_ldaps_or_starttls'],
    },
  }
}

export type OidcTestClientState =
  | { ok: true; authorizationEndpoint?: boolean; tokenEndpoint?: boolean; jwksUri?: boolean }
  | { ok: false; error: string }
  | null

export function defaultAuthProviderTab(dto: AdminAuthProvidersDto | null): AuthProviderTabId {
  if (!dto) return 'local'
  if (dto.ldap.enabled) return 'ldap'
  if (dto.oidc.enabled) return 'oidc'
  return 'local'
}

export function truncateForSummary(value: string, max = 40): string {
  const t = value.trim()
  if (!t) return '—'
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export function ldapConfigCompleteFromForm(p: {
  ldapUrl: string
  ldapBindDn: string
  ldapBaseDn: string
  ldapUserSearchFilter: string
  ldapBindPasswordSet: boolean
}): boolean {
  return isLdapConfigSufficientForLogin({
    enabled:           true,
    url:               p.ldapUrl,
    startTls:          false,
    tlsVerify:         true,
    bindDn:            p.ldapBindDn,
    bindPasswordSet:   p.ldapBindPasswordSet,
    baseDn:            p.ldapBaseDn,
    userSearchFilter:  p.ldapUserSearchFilter,
    usernameAttribute: '',
    displayNameAttribute: '',
    groupAttribute:    '',
    timeoutSec:        10,
  })
}

export function oidcConfigCompleteFromForm(p: {
  oidcIssuer: string
  oidcClientId: string
  oidcClientSecretSet: boolean
}): boolean {
  return isOidcConfigSufficientForLogin({
    enabled:         true,
    issuer:          p.oidcIssuer,
    clientId:        p.oidcClientId,
    clientSecretSet: p.oidcClientSecretSet,
    scopes:          '',
    redirectPath:    '',
    clockSkewSec:    60,
  })
}

export function loginSummaryFromForm(params: {
  ldapEnabled: boolean
  ldapUrl: string
  ldapBindDn: string
  ldapBaseDn: string
  ldapUserSearchFilter: string
  ldapBindPasswordSet: boolean
  oidcEnabled: boolean
  oidcIssuer: string
  oidcClientId: string
  oidcClientSecretSet: boolean
  jitEnabled: boolean
  ldapUserCount: number
  oidcUserCount: number
}): {
  ldap: { available: boolean; reason?: PublicProviderReasonCode }
  oidc: { available: boolean; reason?: PublicProviderReasonCode }
} {
  const dto = {
    ldap: {
      enabled:            params.ldapEnabled,
      url:                params.ldapUrl,
      startTls:           false,
      tlsVerify:          true,
      bindDn:             params.ldapBindDn,
      bindPasswordSet:    params.ldapBindPasswordSet,
      baseDn:             params.ldapBaseDn,
      userSearchFilter:   params.ldapUserSearchFilter,
      usernameAttribute:  'sAMAccountName',
      displayNameAttribute: 'displayName',
      groupAttribute:     'memberOf',
      timeoutSec:         10,
    },
    oidc: {
      enabled:          params.oidcEnabled,
      issuer:           params.oidcIssuer,
      clientId:         params.oidcClientId,
      clientSecretSet:  params.oidcClientSecretSet,
      scopes:           'openid profile email',
      redirectPath:     '/api/auth/oidc/callback',
      clockSkewSec:     60,
    },
    auth: {
      jitEnabled:       params.jitEnabled,
      jitDefaultRole:   'viewer' as UserRole,
      jitDefaultActive: true,
      mfaMode:          'off' as const,
      mappingRulesJson: '[]',
      oidcMaxRole:      null,
      ldapMaxRole:      null,
    },
  }
  const counts = { ldap: params.ldapUserCount, oidc: params.oidcUserCount }
  return {
    ldap: evaluateLdapAvailability(dto, counts),
    oidc: evaluateOidcAvailability(dto, counts),
  }
}

export type MappingPreviewResult = {
  effectiveRole: UserRole
  matchedRuleIndex: number | null
  rules: AuthMappingRule[]
}

export function simulateOidcRoleMapping(params: {
  claimsJson: string
  mappingRulesJson: string
  defaultRole: UserRole
  maxRole: UserRole | null
}): { ok: true; result: MappingPreviewResult } | { ok: false; code: 'invalid_claims' | 'invalid_rules' } {
  let claims: Record<string, unknown>
  try {
    const v = JSON.parse(params.claimsJson.trim() || '{}') as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, code: 'invalid_claims' }
    claims = v as Record<string, unknown>
  } catch {
    return { ok: false, code: 'invalid_claims' }
  }
  const rules = parseAuthMappingRulesJson(params.mappingRulesJson)
  const effectiveRole = resolveRoleFromOidcClaims(claims, rules, params.defaultRole, params.maxRole)
  let matchedRuleIndex: number | null = null
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (rule.match.type !== 'oidc_claim') continue
    const vals = Array.isArray(claims[rule.match.claim])
      ? (claims[rule.match.claim] as unknown[]).filter((x): x is string => typeof x === 'string')
      : typeof claims[rule.match.claim] === 'string'
        ? [claims[rule.match.claim] as string]
        : []
    if (vals.some((s) => s.includes(rule.match.contains))) {
      matchedRuleIndex = i
      break
    }
  }
  return { ok: true, result: { effectiveRole, matchedRuleIndex, rules } }
}

export function simulateLdapRoleMapping(params: {
  groupDnsText: string
  mappingRulesJson: string
  defaultRole: UserRole
  maxRole: UserRole | null
}): { ok: true; result: MappingPreviewResult } | { ok: false; code: 'invalid_rules' } {
  const groupDns = params.groupDnsText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const rules = parseAuthMappingRulesJson(params.mappingRulesJson)
  const effectiveRole = resolveRoleFromLdapGroups(groupDns, rules, params.defaultRole, params.maxRole)
  let matchedRuleIndex: number | null = null
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (rule.match.type !== 'ldap_group_dn') continue
    if (groupDns.some((dn) => dn.includes(rule.match.contains))) {
      matchedRuleIndex = i
      break
    }
  }
  return { ok: true, result: { effectiveRole, matchedRuleIndex, rules } }
}

export const LDAP_USER_SEARCH_SIZE_LIMIT = 5

/** Example mapping rules for admin UI copy (OIDC claim + LDAP group). */
export const MAPPING_RULES_JSON_EXAMPLE = `[
  { "match": { "type": "oidc_claim", "claim": "groups", "contains": "ESOS-Admins" }, "role": "admin" },
  { "match": { "type": "ldap_group_dn", "contains": "CN=ESOS-Operators,OU=Groups,DC=example,DC=com" }, "role": "operator" }
]`

export function oidcCallbackPreview(origin: string, redirectPath: string): string {
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  const base = origin.replace(/\/+$/, '')
  if (!base) return path
  return `${base}${path}`
}

export function ldapHostnameFromUrl(urlStr: string): string | null {
  const trimmed = urlStr.trim()
  if (!trimmed) return null
  const normalized = trimmed.includes('://') ? trimmed : `ldap://${trimmed}`
  try {
    return new URL(normalized).hostname.toLowerCase()
  } catch {
    return null
  }
}

export type MappingRulesJsonErrorCode = 'empty' | 'not_array' | 'invalid_syntax'

export function parseMappingRulesJsonForUi(
  raw: string,
): { ok: true; length: number } | { ok: false; code: MappingRulesJsonErrorCode } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, code: 'empty' }
  try {
    const v = JSON.parse(trimmed) as unknown
    if (!Array.isArray(v)) return { ok: false, code: 'not_array' }
    return { ok: true, length: v.length }
  } catch {
    return { ok: false, code: 'invalid_syntax' }
  }
}

/** Stable id for a security alert row (maps to `admin.authProviders.alerts.<id>.title|description`). */
export type AuthProviderSecurityAlertId =
  | 'ldap_tls_verify_disabled'
  | 'ldap_plain_no_starttls_remote'
  | 'ldap_localhost_plain'
  | 'oidc_issuer_no_https'
  | 'mfa_idp_required'
  | 'mfa_idp_preferred'
  | 'mapping_no_rules'
  | 'jit_default_admin'

export type AuthProviderAlert = {
  id: AuthProviderSecurityAlertId
  color: 'orange' | 'red' | 'blue' | 'gray'
  icon: string
}

function isLocalLdapHost(hostname: string | null): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * UI-only security callouts derived from current form draft (not authoritative vs server validation).
 */
export function authProviderSecurityAlerts(params: {
  ldapUrl: string
  ldapStartTls: boolean
  ldapTlsVerify: boolean
  ldapEnabled: boolean
  oidcIssuer: string
  oidcEnabled: boolean
  mfaMode: string
  jitDefaultRole: string
  mappingRulesJson: string
}): AuthProviderAlert[] {
  const alerts: AuthProviderAlert[] = []
  const host = ldapHostnameFromUrl(params.ldapUrl)

  if (params.ldapEnabled && params.ldapUrl.trim() && !params.ldapTlsVerify) {
    alerts.push({
      id:     'ldap_tls_verify_disabled',
      color:  'orange',
      icon:   'i-heroicons-shield-exclamation',
    })
  }

  if (params.ldapEnabled && params.ldapUrl.trim().toLowerCase().startsWith('ldap://')) {
    if (host && !isLocalLdapHost(host) && !params.ldapStartTls) {
      alerts.push({
        id:     'ldap_plain_no_starttls_remote',
        color:  'orange',
        icon:   'i-heroicons-exclamation-triangle',
      })
    }
    if (host && isLocalLdapHost(host)) {
      alerts.push({
        id:     'ldap_localhost_plain',
        color:  'blue',
        icon:   'i-heroicons-information-circle',
      })
    }
  }

  if (params.oidcEnabled && params.oidcIssuer.trim() && !params.oidcIssuer.trim().toLowerCase().startsWith('https://')) {
    alerts.push({
      id:     'oidc_issuer_no_https',
      color:  'orange',
      icon:   'i-heroicons-lock-open',
    })
  }

  if (params.mfaMode === 'idp_required') {
    alerts.push({
      id:     'mfa_idp_required',
      color:  'blue',
      icon:   'i-heroicons-finger-print',
    })
  }

  if (params.mfaMode === 'idp_preferred') {
    alerts.push({
      id:     'mfa_idp_preferred',
      color:  'gray',
      icon:   'i-heroicons-information-circle',
    })
  }

  const parsed = parseMappingRulesJsonForUi(params.mappingRulesJson)
  if (parsed.ok && parsed.length === 0) {
    alerts.push({
      id:     'mapping_no_rules',
      color:  'orange',
      icon:   'i-heroicons-user-group',
    })
  }

  if (params.jitDefaultRole === 'admin') {
    alerts.push({
      id:     'jit_default_admin',
      color:  'orange',
      icon:   'i-heroicons-key',
    })
  }

  return alerts
}

/** Kind for LDAP URL summary (maps to `admin.authProviders.ldapMode.<kind>`). */
export type LdapConnectionModeKind =
  | 'ldaps'
  | 'ldap_start_tls'
  | 'ldap_localhost_plain'
  | 'ldap_plain_remote'
  | 'empty'
  | 'unknown_url'

export function ldapConnectionModeKind(urlStr: string, startTls: boolean): LdapConnectionModeKind {
  const u = urlStr.trim().toLowerCase()
  if (u.startsWith('ldaps://')) return 'ldaps'
  if (u.startsWith('ldap://')) {
    const h = ldapHostnameFromUrl(urlStr)
    if (h && isLocalLdapHost(h)) return 'ldap_localhost_plain'
    if (startTls) return 'ldap_start_tls'
    return 'ldap_plain_remote'
  }
  if (!u) return 'empty'
  return 'unknown_url'
}

/** User-facing LDAP transport choice (maps to ldap.url + ldap.startTls). */
export type LdapConnectionModeChoice = 'ldaps' | 'starttls' | 'plain'

export function ldapConnectionModeChoiceFromForm(
  urlStr: string,
  startTls: boolean,
): LdapConnectionModeChoice {
  const kind = ldapConnectionModeKind(urlStr, startTls)
  if (kind === 'ldaps') return 'ldaps'
  if (kind === 'ldap_start_tls') return 'starttls'
  if (kind === 'ldap_localhost_plain' || kind === 'ldap_plain_remote') return 'plain'
  const u = urlStr.trim().toLowerCase()
  if (u.startsWith('ldaps://')) return 'ldaps'
  if (startTls) return 'starttls'
  if (u.startsWith('ldap://')) return 'plain'
  return 'ldaps'
}

function swapLdapUrlScheme(urlStr: string, scheme: 'ldap' | 'ldaps'): string {
  const trimmed = urlStr.trim()
  if (!trimmed) return `${scheme}://`
  const lower = trimmed.toLowerCase()
  if (lower.startsWith('ldaps://')) {
    return scheme === 'ldaps' ? trimmed : `ldap://${trimmed.slice(8)}`
  }
  if (lower.startsWith('ldap://')) {
    return scheme === 'ldap' ? trimmed : `ldaps://${trimmed.slice(7)}`
  }
  return `${scheme}://${trimmed.replace(/^\/+/, '')}`
}

export function applyLdapConnectionModeChoice(
  target: { ldapUrl: string; ldapStartTls: boolean },
  mode: LdapConnectionModeChoice,
): void {
  switch (mode) {
    case 'ldaps':
      target.ldapStartTls = false
      target.ldapUrl = swapLdapUrlScheme(target.ldapUrl, 'ldaps')
      break
    case 'starttls':
      target.ldapStartTls = true
      target.ldapUrl = swapLdapUrlScheme(target.ldapUrl, 'ldap')
      break
    case 'plain':
      target.ldapStartTls = false
      target.ldapUrl = swapLdapUrlScheme(target.ldapUrl, 'ldap')
      break
  }
}

export type LdapUrlSchemeHint = 'ok' | 'wrong_scheme' | 'empty'

export function ldapUrlSchemeHint(
  mode: LdapConnectionModeChoice,
  urlStr: string,
): LdapUrlSchemeHint {
  const u = urlStr.trim().toLowerCase()
  if (!u) return 'empty'
  if (mode === 'ldaps') return u.startsWith('ldaps://') ? 'ok' : 'wrong_scheme'
  return u.startsWith('ldap://') ? 'ok' : 'wrong_scheme'
}

/** @deprecated Use ldapConnectionModeKind + i18n; kept for gradual migration if needed */
export function ldapConnectionModeLabel(urlStr: string, startTls: boolean): string {
  const kind = ldapConnectionModeKind(urlStr, startTls)
  const legacy: Record<LdapConnectionModeKind, string> = {
    ldaps:                 'LDAPS (TLS sur le port LDAPS)',
    ldap_start_tls:        'LDAP + StartTLS',
    ldap_localhost_plain:  'LDAP en clair (localhost — développement)',
    ldap_plain_remote:     'LDAP en clair (déconseillé hors localhost)',
    empty:                 '—',
    unknown_url:           'URL non reconnue (attendu ldap:// ou ldaps://)',
  }
  return legacy[kind]
}

export type AuthProviderBadgeId =
  | 'oidc_mfa_required'
  | 'oidc_mfa_preferred'
  | 'oidc_mfa_off'
  | 'oidc_disabled'
  | 'ldap_tls_verified'
  | 'ldap_tls_unverified'
  | 'ldap_disabled'
  | 'mapping_invalid'
  | 'mapping_empty'
  | 'mapping_rules'
  | 'secrets_ok'
  | 'secrets_incomplete'

export type AuthProviderSummaryBadge = {
  id: AuthProviderBadgeId
  color: 'green' | 'gray' | 'orange' | 'red' | 'blue'
  /** When id === mapping_rules, number of rules for pluralized label */
  ruleCount?: number
}

export function authProviderSummaryBadges(p: {
  mfaMode: string
  ldapEnabled: boolean
  ldapTlsVerify: boolean
  oidcClientSecretSet: boolean
  ldapBindPasswordSet: boolean
  mappingRulesJson: string
  oidcEnabled: boolean
}): AuthProviderSummaryBadge[] {
  const out: AuthProviderSummaryBadge[] = []
  if (p.oidcEnabled) {
    if (p.mfaMode === 'idp_required') out.push({ id: 'oidc_mfa_required', color: 'green' })
    else if (p.mfaMode === 'idp_preferred') out.push({ id: 'oidc_mfa_preferred', color: 'blue' })
    else out.push({ id: 'oidc_mfa_off', color: 'gray' })
  } else {
    out.push({ id: 'oidc_disabled', color: 'gray' })
  }
  if (p.ldapEnabled) {
    out.push(
      p.ldapTlsVerify
        ? { id: 'ldap_tls_verified', color: 'green' }
        : { id: 'ldap_tls_unverified', color: 'orange' },
    )
  } else {
    out.push({ id: 'ldap_disabled', color: 'gray' })
  }
  const map = parseMappingRulesJsonForUi(p.mappingRulesJson)
  if (!map.ok) out.push({ id: 'mapping_invalid', color: 'red' })
  else if (map.length === 0) out.push({ id: 'mapping_empty', color: 'orange' })
  else out.push({ id: 'mapping_rules', color: 'green', ruleCount: map.length })

  const needOidcSecret = p.oidcEnabled
  const needLdapPw     = p.ldapEnabled
  if (needOidcSecret || needLdapPw) {
    const ok
      = (!needOidcSecret || p.oidcClientSecretSet) && (!needLdapPw || p.ldapBindPasswordSet)
    out.push(ok ? { id: 'secrets_ok', color: 'green' } : { id: 'secrets_incomplete', color: 'orange' })
  }
  return out
}

/** Top banner on LDAP card (subset of security rules). */
export type LdapCardTopWarning = {
  id: AuthProviderSecurityAlertId
  color: 'orange'
  icon: string
}

export function ldapCardTopWarningFromForm(params: {
  ldapEnabled: boolean
  ldapUrl: string
  ldapStartTls: boolean
  ldapTlsVerify: boolean
}): LdapCardTopWarning | null {
  if (!params.ldapEnabled || !params.ldapUrl.trim()) return null
  const host = ldapHostnameFromUrl(params.ldapUrl)?.toLowerCase() ?? ''
  const local  = host === 'localhost' || host === '127.0.0.1'
  const u      = params.ldapUrl.trim().toLowerCase()
  if (u.startsWith('ldap://') && host && local && !params.ldapStartTls) {
    return {
      id:    'ldap_localhost_plain',
      color: 'blue',
      icon:  'i-heroicons-information-circle',
    }
  }
  if (u.startsWith('ldap://') && host && !local && !params.ldapStartTls) {
    return {
      id:    'ldap_plain_no_starttls_remote',
      color: 'orange',
      icon:  'i-heroicons-exclamation-triangle',
    }
  }
  if (!params.ldapTlsVerify) {
    return {
      id:    'ldap_tls_verify_disabled',
      color: 'orange',
      icon:  'i-heroicons-exclamation-triangle',
    }
  }
  return null
}
