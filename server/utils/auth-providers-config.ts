/**
 * Auth provider settings keys + admin DTO (no decrypted secrets in API).
 */
import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { getDB } from '../db'
import { appSettings } from '../db/schema'
import { getAllSettings, getSetting, setSetting } from '../db/repositories/settings.repository'
import type { UserRole } from './types'
import type { AuthMfaMode } from './auth-providers-role-map'
import { parseUserRole } from './auth-providers-role-map'
import {
  evaluateLdapAvailability,
  evaluateOidcAvailability,
  isLdapConfigSufficientForLogin,
  isOidcConfigSufficientForLogin,
  type ProviderLoginSummary,
  type PublicProviderReasonCode,
} from './auth-providers-public'
import { countActiveUsersByAuthSource } from '../db/repositories/user.repository'

export const AUTH_PROVIDER_DEFAULTS: Array<{ key: string; value: string; type: 'string' | 'number' | 'boolean' | 'secret' }> = [
  { key: 'ldap.enabled', value: 'false', type: 'boolean' },
  { key: 'ldap.url', value: '', type: 'string' },
  { key: 'ldap.starttls', value: 'false', type: 'boolean' },
  { key: 'ldap.tls_verify', value: 'true', type: 'boolean' },
  { key: 'ldap.bind_dn', value: '', type: 'string' },
  { key: 'ldap.bind_password', value: '', type: 'secret' },
  { key: 'ldap.base_dn', value: '', type: 'string' },
  { key: 'ldap.user_search_filter', value: '(&(objectClass=user)(sAMAccountName={{username}}))', type: 'string' },
  { key: 'ldap.username_attribute', value: 'sAMAccountName', type: 'string' },
  { key: 'ldap.display_name_attribute', value: 'displayName', type: 'string' },
  { key: 'ldap.group_attribute', value: 'memberOf', type: 'string' },
  { key: 'ldap.timeout_sec', value: '10', type: 'number' },

  { key: 'oidc.enabled', value: 'false', type: 'boolean' },
  { key: 'oidc.issuer', value: '', type: 'string' },
  { key: 'oidc.client_id', value: '', type: 'string' },
  { key: 'oidc.client_secret', value: '', type: 'secret' },
  { key: 'oidc.scopes', value: 'openid profile email', type: 'string' },
  { key: 'oidc.redirect_path', value: '/api/auth/oidc/callback', type: 'string' },
  { key: 'oidc.clock_skew_sec', value: '60', type: 'number' },

  { key: 'auth.jit.enabled', value: 'false', type: 'boolean' },
  { key: 'auth.jit.default_role', value: 'viewer', type: 'string' },
  { key: 'auth.jit.default_active', value: 'true', type: 'boolean' },
  { key: 'auth.mfa.mode', value: 'off', type: 'string' },
  { key: 'auth.mapping_rules_json', value: '[]', type: 'string' },
  { key: 'auth.oidc.max_role', value: '', type: 'string' },
  { key: 'auth.ldap.max_role', value: '', type: 'string' },
]

export async function ensureAuthProviderDefaultSettings(): Promise<void> {
  const db = getDB()
  for (const def of AUTH_PROVIDER_DEFAULTS) {
    const row = db.select({ key: appSettings.key }).from(appSettings).where(eq(appSettings.key, def.key)).get()
    if (row) continue
    await setSetting(def.key, def.value, def.type)
  }
}

function bool(s: string | undefined, d: boolean): boolean {
  if (s == null || s === '') return d
  return s === 'true' || s === '1'
}

function int(s: string | undefined, d: number): number {
  const n = parseInt(s ?? '', 10)
  return Number.isFinite(n) ? n : d
}

export interface AdminAuthProvidersSummary {
  counts: {
    local: number
    ldap:  number
    oidc:  number
  }
  config: {
    ldapComplete: boolean
    oidcComplete: boolean
  }
  login: {
    ldap: ProviderLoginSummary
    oidc: ProviderLoginSummary
  }
}

export type { PublicProviderReasonCode }

export interface AdminAuthProvidersDto {
  summary: AdminAuthProvidersSummary
  ldap: {
    enabled:           boolean
    url:               string
    startTls:          boolean
    tlsVerify:         boolean
    bindDn:            string
    bindPasswordSet:   boolean
    baseDn:            string
    userSearchFilter:  string
    usernameAttribute: string
    displayNameAttribute: string
    groupAttribute:    string
    timeoutSec:        number
  }
  oidc: {
    enabled:           boolean
    issuer:            string
    clientId:          string
    clientSecretSet:   boolean
    scopes:            string
    redirectPath:      string
    clockSkewSec:      number
  }
  auth: {
    jitEnabled:        boolean
    jitDefaultRole:    UserRole
    jitDefaultActive:  boolean
    mfaMode:           AuthMfaMode
    mappingRulesJson:  string
    oidcMaxRole:       UserRole | null
    ldapMaxRole:       UserRole | null
  }
}

export async function buildAdminAuthProvidersDto(): Promise<AdminAuthProvidersDto> {
  const s = await getAllSettings()

  const mfaRaw  = (s['auth.mfa.mode'] ?? 'off') as string
  const mfaMode: AuthMfaMode =
    mfaRaw === 'idp_required' || mfaRaw === 'idp_preferred' ? mfaRaw : 'off'

  const oidcMaxRaw = (s['auth.oidc.max_role'] ?? '').trim()
  const ldapMaxRaw = (s['auth.ldap.max_role'] ?? '').trim()

  const ldap = {
      enabled:            bool(s['ldap.enabled'], false),
      url:                s['ldap.url'] ?? '',
      startTls:           bool(s['ldap.starttls'], false),
      tlsVerify:          bool(s['ldap.tls_verify'], true),
      bindDn:             s['ldap.bind_dn'] ?? '',
      bindPasswordSet:    (s['ldap.bind_password'] ?? '') === '***',
      baseDn:             s['ldap.base_dn'] ?? '',
      userSearchFilter:   s['ldap.user_search_filter'] ?? '',
      usernameAttribute:  s['ldap.username_attribute'] ?? 'sAMAccountName',
      displayNameAttribute: s['ldap.display_name_attribute'] ?? 'displayName',
      groupAttribute:     s['ldap.group_attribute'] ?? 'memberOf',
      timeoutSec:         int(s['ldap.timeout_sec'], 10),
    }

  const oidc = {
      enabled:          bool(s['oidc.enabled'], false),
      issuer:           s['oidc.issuer'] ?? '',
      clientId:         s['oidc.client_id'] ?? '',
      clientSecretSet:  (s['oidc.client_secret'] ?? '') === '***',
      scopes:           s['oidc.scopes'] ?? 'openid profile email',
      redirectPath:     s['oidc.redirect_path'] ?? '/api/auth/oidc/callback',
      clockSkewSec:     int(s['oidc.clock_skew_sec'], 60),
    }

  const auth = {
      jitEnabled:       bool(s['auth.jit.enabled'], false),
      jitDefaultRole:   parseUserRole(s['auth.jit.default_role'], 'viewer'),
      jitDefaultActive: bool(s['auth.jit.default_active'], true),
      mfaMode,
      mappingRulesJson: s['auth.mapping_rules_json'] ?? '[]',
      oidcMaxRole:      oidcMaxRaw === '' ? null : parseUserRole(oidcMaxRaw, 'viewer'),
      ldapMaxRole:      ldapMaxRaw === '' ? null : parseUserRole(ldapMaxRaw, 'viewer'),
    }

  const [localCount, ldapCount, oidcCount] = await Promise.all([
    countActiveUsersByAuthSource('local'),
    countActiveUsersByAuthSource('ldap'),
    countActiveUsersByAuthSource('oidc'),
  ])

  const counts = { local: localCount, ldap: ldapCount, oidc: oidcCount }
  const dtoBody = { ldap, oidc, auth }

  return {
    summary: {
      counts,
      config: {
        ldapComplete: isLdapConfigSufficientForLogin(ldap),
        oidcComplete: isOidcConfigSufficientForLogin(oidc),
      },
      login: {
        ldap: evaluateLdapAvailability(dtoBody, counts),
        oidc: evaluateOidcAvailability(dtoBody, counts),
      },
    },
    ...dtoBody,
  }
}

/** Raw settings for server-side LDAP/OIDC (decrypts secrets via getSetting). */
export async function loadAuthProviderSecretsForServer(): Promise<{
  ldapBindPassword: string | null
  oidcClientSecret: string | null
}> {
  const [ldapBindPassword, oidcClientSecret] = await Promise.all([
    getSetting('ldap.bind_password'),
    getSetting('oidc.client_secret'),
  ])
  return { ldapBindPassword, oidcClientSecret }
}

export type AuthProvidersPatchBody = Partial<{
  ldap: Partial<{
    enabled: boolean
    url: string
    startTls: boolean
    tlsVerify: boolean
    bindDn: string
    bindPassword: string
    baseDn: string
    userSearchFilter: string
    usernameAttribute: string
    displayNameAttribute: string
    groupAttribute: string
    timeoutSec: number
  }>
  oidc: Partial<{
    enabled: boolean
    issuer: string
    clientId: string
    clientSecret: string
    scopes: string
    redirectPath: string
    clockSkewSec: number
  }>
  auth: Partial<{
    jitEnabled: boolean
    jitDefaultRole: UserRole
    jitDefaultActive: boolean
    mfaMode: AuthMfaMode
    mappingRulesJson: string
    oidcMaxRole: UserRole | '' | null
    ldapMaxRole: UserRole | '' | null
  }>
}>

export async function applyAuthProvidersPatch(body: AuthProvidersPatchBody): Promise<string[]> {
  const updated: string[] = []

  if (body.ldap) {
    const L = body.ldap
    if (L.enabled !== undefined) {
      await setSetting('ldap.enabled', String(L.enabled), 'boolean')
      updated.push('ldap.enabled')
    }
    if (L.url !== undefined) {
      await setSetting('ldap.url', L.url, 'string')
      updated.push('ldap.url')
    }
    if (L.startTls !== undefined) {
      await setSetting('ldap.starttls', String(L.startTls), 'boolean')
      updated.push('ldap.starttls')
    }
    if (L.tlsVerify !== undefined) {
      await setSetting('ldap.tls_verify', String(L.tlsVerify), 'boolean')
      updated.push('ldap.tls_verify')
    }
    if (L.bindDn !== undefined) {
      await setSetting('ldap.bind_dn', L.bindDn, 'string')
      updated.push('ldap.bind_dn')
    }
    if (L.bindPassword !== undefined && L.bindPassword !== '') {
      await setSetting('ldap.bind_password', L.bindPassword, 'secret')
      updated.push('ldap.bind_password')
    }
    if (L.baseDn !== undefined) {
      await setSetting('ldap.base_dn', L.baseDn, 'string')
      updated.push('ldap.base_dn')
    }
    if (L.userSearchFilter !== undefined) {
      await setSetting('ldap.user_search_filter', L.userSearchFilter, 'string')
      updated.push('ldap.user_search_filter')
    }
    if (L.usernameAttribute !== undefined) {
      await setSetting('ldap.username_attribute', L.usernameAttribute, 'string')
      updated.push('ldap.username_attribute')
    }
    if (L.displayNameAttribute !== undefined) {
      await setSetting('ldap.display_name_attribute', L.displayNameAttribute, 'string')
      updated.push('ldap.display_name_attribute')
    }
    if (L.groupAttribute !== undefined) {
      await setSetting('ldap.group_attribute', L.groupAttribute, 'string')
      updated.push('ldap.group_attribute')
    }
    if (L.timeoutSec !== undefined) {
      await setSetting('ldap.timeout_sec', String(L.timeoutSec), 'number')
      updated.push('ldap.timeout_sec')
    }
  }

  if (body.oidc) {
    const O = body.oidc
    if (O.enabled !== undefined) {
      await setSetting('oidc.enabled', String(O.enabled), 'boolean')
      updated.push('oidc.enabled')
    }
    if (O.issuer !== undefined) {
      await setSetting('oidc.issuer', O.issuer.trim(), 'string')
      updated.push('oidc.issuer')
    }
    if (O.clientId !== undefined) {
      await setSetting('oidc.client_id', O.clientId, 'string')
      updated.push('oidc.client_id')
    }
    if (O.clientSecret !== undefined && O.clientSecret !== '') {
      await setSetting('oidc.client_secret', O.clientSecret, 'secret')
      updated.push('oidc.client_secret')
    }
    if (O.scopes !== undefined) {
      await setSetting('oidc.scopes', O.scopes, 'string')
      updated.push('oidc.scopes')
    }
    if (O.redirectPath !== undefined) {
      await setSetting('oidc.redirect_path', O.redirectPath.startsWith('/') ? O.redirectPath : `/${O.redirectPath}`, 'string')
      updated.push('oidc.redirect_path')
    }
    if (O.clockSkewSec !== undefined) {
      await setSetting('oidc.clock_skew_sec', String(O.clockSkewSec), 'number')
      updated.push('oidc.clock_skew_sec')
    }
  }

  if (body.auth) {
    const A = body.auth
    if (A.jitEnabled !== undefined) {
      await setSetting('auth.jit.enabled', String(A.jitEnabled), 'boolean')
      updated.push('auth.jit.enabled')
    }
    if (A.jitDefaultRole !== undefined) {
      await setSetting('auth.jit.default_role', A.jitDefaultRole, 'string')
      updated.push('auth.jit.default_role')
    }
    if (A.jitDefaultActive !== undefined) {
      await setSetting('auth.jit.default_active', String(A.jitDefaultActive), 'boolean')
      updated.push('auth.jit.default_active')
    }
    if (A.mfaMode !== undefined) {
      if (A.mfaMode !== 'off' && A.mfaMode !== 'idp_required' && A.mfaMode !== 'idp_preferred') {
        throw createError({ statusCode: 400, message: 'auth.mfa.mode invalide' })
      }
      await setSetting('auth.mfa.mode', A.mfaMode, 'string')
      updated.push('auth.mfa.mode')
    }
    if (A.mappingRulesJson !== undefined) {
      try {
        JSON.parse(A.mappingRulesJson)
      } catch {
        throw createError({ statusCode: 400, message: 'auth.mappingRulesJson JSON invalide' })
      }
      await setSetting('auth.mapping_rules_json', A.mappingRulesJson, 'string')
      updated.push('auth.mapping_rules_json')
    }
    if (A.oidcMaxRole !== undefined) {
      const v = A.oidcMaxRole === '' || A.oidcMaxRole == null ? '' : A.oidcMaxRole
      if (v && v !== 'admin' && v !== 'operator' && v !== 'viewer') {
        throw createError({ statusCode: 400, message: 'auth.oidc.max_role invalide' })
      }
      await setSetting('auth.oidc.max_role', v, 'string')
      updated.push('auth.oidc.max_role')
    }
    if (A.ldapMaxRole !== undefined) {
      const v = A.ldapMaxRole === '' || A.ldapMaxRole == null ? '' : A.ldapMaxRole
      if (v && v !== 'admin' && v !== 'operator' && v !== 'viewer') {
        throw createError({ statusCode: 400, message: 'auth.ldap.max_role invalide' })
      }
      await setSetting('auth.ldap.max_role', v, 'string')
      updated.push('auth.ldap.max_role')
    }
  }

  return updated
}
