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

export type AuthProvidersHeaderFormSnapshot = {
  enabled:              boolean
  userHeader:           string
  emailHeader:          string
  groupsHeader:         string
  groupsDelimiter:      string
  displayNameHeader:    string
  issuer:               string
  tokenHeader:          string
  requireInternalToken: boolean
}

export type AuthProvidersAuthFormSnapshot = {
  jitEnabled:       boolean
  jitDefaultRole:   UserRole
  jitDefaultActive: boolean
  mfaMode:          'off' | 'idp_required' | 'idp_preferred'
  mappingRulesJson: string
  oidcMaxRole:      AuthProvidersMaxRoleField
  ldapMaxRole:      AuthProvidersMaxRoleField
  headerMaxRole:    AuthProvidersMaxRoleField
}

export type AuthProvidersFormSnapshot = {
  ldap: AuthProvidersLdapFormSnapshot
  oidc: AuthProvidersOidcFormSnapshot
  header: AuthProvidersHeaderFormSnapshot
  auth: AuthProvidersAuthFormSnapshot
  /** True when user typed a new LDAP bind password (blank = keep, not dirty). */
  ldapBindPasswordEntered: boolean
  /** True when user typed a new OIDC client secret. */
  oidcClientSecretEntered: boolean
  /** True when user typed a new header internal token. */
  headerInternalTokenEntered: boolean
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

  headerEnabled: boolean
  headerUserHeader: string
  headerEmailHeader: string
  headerGroupsHeader: string
  headerGroupsDelimiter: string
  headerDisplayNameHeader: string
  headerIssuer: string
  headerTokenHeader: string
  headerRequireInternalToken: boolean

  jitEnabled: boolean
  jitDefaultRole: UserRole
  jitDefaultActive: boolean
  mfaMode: 'off' | 'idp_required' | 'idp_preferred'
  mappingRulesJson: string
  oidcMaxRole: AuthProvidersMaxRoleField
  ldapMaxRole: AuthProvidersMaxRoleField
  headerMaxRole: AuthProvidersMaxRoleField
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
    header: {
      enabled:              d.header.enabled,
      userHeader:           trim(d.header.userHeader),
      emailHeader:          trim(d.header.emailHeader),
      groupsHeader:         trim(d.header.groupsHeader),
      groupsDelimiter:      trim(d.header.groupsDelimiter),
      displayNameHeader:    trim(d.header.displayNameHeader),
      issuer:               trim(d.header.issuer),
      tokenHeader:          trim(d.header.tokenHeader),
      requireInternalToken: d.header.requireInternalToken,
    },
    auth: {
      jitEnabled:       d.auth.jitEnabled,
      jitDefaultRole:   d.auth.jitDefaultRole,
      jitDefaultActive: d.auth.jitDefaultActive,
      mfaMode:          d.auth.mfaMode,
      mappingRulesJson: normalizeMappingRulesJson(d.auth.mappingRulesJson),
      oidcMaxRole:      maxRoleFromDto(d.auth.oidcMaxRole),
      ldapMaxRole:      maxRoleFromDto(d.auth.ldapMaxRole),
      headerMaxRole:    maxRoleFromDto(d.auth.headerMaxRole),
    },
    ldapBindPasswordEntered: false,
    oidcClientSecretEntered: false,
    headerInternalTokenEntered: false,
  }
}

export function snapshotFromFormInput(
  input: AuthProvidersFormInput,
  secrets?: { ldapBindPassword?: string; oidcClientSecret?: string; headerInternalToken?: string },
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
    header: {
      enabled:              input.headerEnabled,
      userHeader:           trim(input.headerUserHeader),
      emailHeader:          trim(input.headerEmailHeader),
      groupsHeader:         trim(input.headerGroupsHeader),
      groupsDelimiter:      trim(input.headerGroupsDelimiter),
      displayNameHeader:    trim(input.headerDisplayNameHeader),
      issuer:               trim(input.headerIssuer),
      tokenHeader:          trim(input.headerTokenHeader),
      requireInternalToken: input.headerRequireInternalToken,
    },
    auth: {
      jitEnabled:       input.jitEnabled,
      jitDefaultRole:   input.jitDefaultRole,
      jitDefaultActive: input.jitDefaultActive,
      mfaMode:          input.mfaMode,
      mappingRulesJson: normalizeMappingRulesJson(input.mappingRulesJson),
      oidcMaxRole:      input.oidcMaxRole,
      ldapMaxRole:      input.ldapMaxRole,
      headerMaxRole:    input.headerMaxRole,
    },
    ldapBindPasswordEntered: (secrets?.ldapBindPassword ?? '').length > 0,
    oidcClientSecretEntered: (secrets?.oidcClientSecret ?? '').length > 0,
    headerInternalTokenEntered: (secrets?.headerInternalToken ?? '').length > 0,
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

export function authProvidersHeaderDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return (
    JSON.stringify(baseline.header) !== JSON.stringify(current.header)
    || JSON.stringify({ headerMaxRole: baseline.auth.headerMaxRole })
      !== JSON.stringify({ headerMaxRole: current.auth.headerMaxRole })
    || baseline.headerInternalTokenEntered !== current.headerInternalTokenEntered
  )
}

export function authProvidersMappingDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return mappingAuthSubset(baseline.auth) !== mappingAuthSubset(current.auth)
}

export function authProvidersSecurityDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  if (!baseline || !current) return false
  return baseline.auth.mfaMode !== current.auth.mfaMode
}

/** @deprecated Use authProvidersMappingDirty */
export function authProvidersRolesDirty(
  baseline: AuthProvidersFormSnapshot | null,
  current: AuthProvidersFormSnapshot | null,
): boolean {
  return authProvidersMappingDirty(baseline, current)
}

function mappingAuthSubset(auth: AuthProvidersAuthFormSnapshot): string {
  return JSON.stringify({
    jitEnabled:       auth.jitEnabled,
    jitDefaultRole:   auth.jitDefaultRole,
    jitDefaultActive: auth.jitDefaultActive,
    mappingRulesJson: auth.mappingRulesJson,
    oidcMaxRole:      auth.oidcMaxRole,
    ldapMaxRole:      auth.ldapMaxRole,
    headerMaxRole:    auth.headerMaxRole,
  })
}

export function applyLdapSnapshotToFormInput(
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
}

export function applyOidcSnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  target.oidcEnabled       = snap.oidc.enabled
  target.oidcIssuer        = snap.oidc.issuer
  target.oidcClientId      = snap.oidc.clientId
  target.oidcScopes        = snap.oidc.scopes
  target.oidcRedirectPath  = snap.oidc.redirectPath
  target.oidcClockSkewSec  = snap.oidc.clockSkewSec
}

export function applyHeaderSnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  target.headerEnabled               = snap.header.enabled
  target.headerUserHeader            = snap.header.userHeader
  target.headerEmailHeader           = snap.header.emailHeader
  target.headerGroupsHeader          = snap.header.groupsHeader
  target.headerGroupsDelimiter       = snap.header.groupsDelimiter
  target.headerDisplayNameHeader     = snap.header.displayNameHeader
  target.headerIssuer                = snap.header.issuer
  target.headerTokenHeader           = snap.header.tokenHeader
  target.headerRequireInternalToken  = snap.header.requireInternalToken
  target.headerMaxRole               = snap.auth.headerMaxRole
}

export function applyMappingSnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  target.jitEnabled       = snap.auth.jitEnabled
  target.jitDefaultRole   = snap.auth.jitDefaultRole
  target.jitDefaultActive = snap.auth.jitDefaultActive
  target.mappingRulesJson = snap.auth.mappingRulesJson
  target.oidcMaxRole      = snap.auth.oidcMaxRole
  target.ldapMaxRole      = snap.auth.ldapMaxRole
  target.headerMaxRole    = snap.auth.headerMaxRole
}

export function applySecuritySnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  target.mfaMode = snap.auth.mfaMode
}

export function applySnapshotToFormInput(
  target: AuthProvidersFormInput,
  snap: AuthProvidersFormSnapshot,
): void {
  applyLdapSnapshotToFormInput(target, snap)
  applyOidcSnapshotToFormInput(target, snap)
  applyHeaderSnapshotToFormInput(target, snap)
  applyMappingSnapshotToFormInput(target, snap)
  applySecuritySnapshotToFormInput(target, snap)
}

export function authProvidersFormValidationOk(mappingRulesJson: string): boolean {
  return parseMappingRulesJsonForUi(mappingRulesJson).ok
}
