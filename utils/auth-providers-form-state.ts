/**
 * Normalized auth-providers form snapshots for dirty detection (Vitest-safe).
 */
import type { AdminAuthProvidersDto } from '../server/utils/auth-providers-config'
import type { UserRole } from '../server/utils/types'
import { parseMappingRulesJsonForUi } from './auth-providers-admin-ui'

export type AuthProvidersMaxRoleField = 'none' | UserRole

export type AuthProvidersLdapFormSnapshot = {
  enabled:             boolean
  url:                 string
  startTls:            boolean
  tlsVerify:           boolean
  bindDn:              string
  baseDn:              string
  userSearchFilter:    string
  usernameAttribute:   string
  displayNameAttribute: string
  groupAttribute:      string
  timeoutSec:          number
}

export type AuthProvidersOidcFormSnapshot = {
  enabled:      boolean
  issuer:       string
  clientId:     string
  scopes:       string
  redirectPath: string
  clockSkewSec: number
}

export type AuthProvidersAuthFormSnapshot = {
  jitEnabled:       boolean
  jitDefaultRole:   UserRole
  jitDefaultActive: boolean
  mfaMode:          'off' | 'idp_required' | 'idp_preferred'
  mappingRulesJson: string
  oidcMaxRole:      AuthProvidersMaxRoleField
  ldapMaxRole:      AuthProvidersMaxRoleField
}

export type AuthProvidersFormSnapshot = {
  ldap: AuthProvidersLdapFormSnapshot
  oidc: AuthProvidersOidcFormSnapshot
  auth: AuthProvidersAuthFormSnapshot
  /** True when user typed a new LDAP bind password (blank = keep, not dirty). */
  ldapBindPasswordEntered: boolean
  /** True when user typed a new OIDC client secret. */
  oidcClientSecretEntered: boolean
}

export type AuthProvidersFormInput = {
  ldapEnabled: boolean
  ldapUrl: string
  ldapStartTls: boolean
  ldapTlsVerify: boolean
  ldapBindDn: string
  ldapBaseDn: string
  ldapUserSearchFilter: string
  ldapUsernameAttribute: string
  ldapDisplayNameAttribute: string
  ldapGroupAttribute: string
  ldapTimeoutSec: number

  oidcEnabled: boolean
  oidcIssuer: string
  oidcClientId: string
  oidcScopes: string
  oidcRedirectPath: string
  oidcClockSkewSec: number

  jitEnabled: boolean
  jitDefaultRole: UserRole
  jitDefaultActive: boolean
  mfaMode: 'off' | 'idp_required' | 'idp_preferred'
  mappingRulesJson: string
  oidcMaxRole: AuthProvidersMaxRoleField
  ldapMaxRole: AuthProvidersMaxRoleField
}

function trim(s: string): string {
  return s.trim()
}

function maxRoleFromDto(v: UserRole | null | undefined): AuthProvidersMaxRoleField {
  return v ?? 'none'
}

/** Normalize mapping JSON for stable comparison (valid JSON only). */
export function normalizeMappingRulesJson(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '[]'
  const parsed = parseMappingRulesJsonForUi(trimmed)
  if (!parsed.ok) return trimmed
  try {
    return JSON.stringify(JSON.parse(trimmed))
  } catch {
    return trimmed
  }
}

export function snapshotFromDto(d: AdminAuthProvidersDto): AuthProvidersFormSnapshot {
  return {
    ldap: {
      enabled:              d.ldap.enabled,
      url:                  trim(d.ldap.url),
      startTls:             d.ldap.startTls,
      tlsVerify:            d.ldap.tlsVerify,
      bindDn:               trim(d.ldap.bindDn),
      baseDn:               trim(d.ldap.baseDn),
      userSearchFilter:     trim(d.ldap.userSearchFilter),
      usernameAttribute:    trim(d.ldap.usernameAttribute),
      displayNameAttribute: trim(d.ldap.displayNameAttribute),
      groupAttribute:       trim(d.ldap.groupAttribute),
      timeoutSec:           d.ldap.timeoutSec,
    },
    oidc: {
      enabled:      d.oidc.enabled,
      issuer:       trim(d.oidc.issuer),
      clientId:     trim(d.oidc.clientId),
      scopes:       trim(d.oidc.scopes),
      redirectPath: trim(d.oidc.redirectPath),
      clockSkewSec: d.oidc.clockSkewSec,
    },
    auth: {
      jitEnabled:       d.auth.jitEnabled,
      jitDefaultRole:   d.auth.jitDefaultRole,
      jitDefaultActive: d.auth.jitDefaultActive,
      mfaMode:          d.auth.mfaMode,
      mappingRulesJson: normalizeMappingRulesJson(d.auth.mappingRulesJson),
      oidcMaxRole:      maxRoleFromDto(d.auth.oidcMaxRole),
      ldapMaxRole:      maxRoleFromDto(d.auth.ldapMaxRole),
    },
    ldapBindPasswordEntered: false,
    oidcClientSecretEntered: false,
  }
}

export function snapshotFromFormInput(
  input: AuthProvidersFormInput,
  secrets?: { ldapBindPassword?: string; oidcClientSecret?: string },
): AuthProvidersFormSnapshot {
  return {
    ldap: {
      enabled:              input.ldapEnabled,
      url:                  trim(input.ldapUrl),
      startTls:             input.ldapStartTls,
      tlsVerify:            input.ldapTlsVerify,
      bindDn:               trim(input.ldapBindDn),
      baseDn:               trim(input.ldapBaseDn),
      userSearchFilter:     trim(input.ldapUserSearchFilter),
      usernameAttribute:    trim(input.ldapUsernameAttribute),
      displayNameAttribute: trim(input.ldapDisplayNameAttribute),
      groupAttribute:       trim(input.ldapGroupAttribute),
      timeoutSec:           input.ldapTimeoutSec,
    },
    oidc: {
      enabled:      input.oidcEnabled,
      issuer:       trim(input.oidcIssuer),
      clientId:     trim(input.oidcClientId),
      scopes:       trim(input.oidcScopes),
      redirectPath: trim(input.oidcRedirectPath),
      clockSkewSec: input.oidcClockSkewSec,
    },
    auth: {
      jitEnabled:       input.jitEnabled,
      jitDefaultRole:   input.jitDefaultRole,
      jitDefaultActive: input.jitDefaultActive,
      mfaMode:          input.mfaMode,
      mappingRulesJson: normalizeMappingRulesJson(input.mappingRulesJson),
      oidcMaxRole:      input.oidcMaxRole,
      ldapMaxRole:      input.ldapMaxRole,
    },
    ldapBindPasswordEntered: (secrets?.ldapBindPassword ?? '').length > 0,
    oidcClientSecretEntered: (secrets?.oidcClientSecret ?? '').length > 0,
  }
}

function snapEqual(a: AuthProvidersFormSnapshot, b: AuthProvidersFormSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function authProvidersFormDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return !snapEqual(baseline, current)
}

export function authProvidersLdapDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return (
    JSON.stringify(baseline.ldap) !== JSON.stringify(current.ldap)
    || baseline.ldapBindPasswordEntered !== current.ldapBindPasswordEntered
  )
}

export function authProvidersOidcDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return (
    JSON.stringify(baseline.oidc) !== JSON.stringify(current.oidc)
    || baseline.oidcClientSecretEntered !== current.oidcClientSecretEntered
  )
}

export function authProvidersRolesDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return JSON.stringify(baseline.auth) !== JSON.stringify(current.auth)
}

export function applySnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  target.ldapEnabled              = snap.ldap.enabled
  target.ldapUrl                  = snap.ldap.url
  target.ldapStartTls             = snap.ldap.startTls
  target.ldapTlsVerify            = snap.ldap.tlsVerify
  target.ldapBindDn               = snap.ldap.bindDn
  target.ldapBaseDn               = snap.ldap.baseDn
  target.ldapUserSearchFilter     = snap.ldap.userSearchFilter
  target.ldapUsernameAttribute    = snap.ldap.usernameAttribute
  target.ldapDisplayNameAttribute = snap.ldap.displayNameAttribute
  target.ldapGroupAttribute       = snap.ldap.groupAttribute
  target.ldapTimeoutSec           = snap.ldap.timeoutSec

  target.oidcEnabled       = snap.oidc.enabled
  target.oidcIssuer        = snap.oidc.issuer
  target.oidcClientId      = snap.oidc.clientId
  target.oidcScopes        = snap.oidc.scopes
  target.oidcRedirectPath  = snap.oidc.redirectPath
  target.oidcClockSkewSec  = snap.oidc.clockSkewSec

  target.jitEnabled        = snap.auth.jitEnabled
  target.jitDefaultRole    = snap.auth.jitDefaultRole
  target.jitDefaultActive  = snap.auth.jitDefaultActive
  target.mfaMode           = snap.auth.mfaMode
  target.mappingRulesJson  = snap.auth.mappingRulesJson
  target.oidcMaxRole       = snap.auth.oidcMaxRole
  target.ldapMaxRole       = snap.auth.ldapMaxRole
}

export function authProvidersFormValidationOk(mappingRulesJson: string): boolean {
  return parseMappingRulesJsonForUi(mappingRulesJson).ok
}
