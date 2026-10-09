/**
 * Public auth provider visibility (login page). No secrets in output.
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'
import {
  isHeaderAuthConfigSufficient as isHeaderAuthConfigSufficientCore,
} from './header-auth'

export { isHeaderAuthConfigSufficientCore as isHeaderAuthConfigSufficient }

/** Settings slice used for login availability (no summary / counts). */
export type AuthProvidersEvalDto = Pick<AdminAuthProvidersDto, 'ldap' | 'oidc' | 'header' | 'auth'>

export type AuthProviderKey = 'local' | 'ldap' | 'oidc' | 'header'

export type PublicProviderReasonCode =
  | 'disabled'
  | 'config_incomplete'
  | 'no_provisioned_users'

export type PublicAuthProvider = {
  key: AuthProviderKey
  label: string
  available: boolean
  loginUrl?: string
  reason?: PublicProviderReasonCode
}

export type PublicAuthProvidersResponse = {
  providers: PublicAuthProvider[]
  defaultProvider?: AuthProviderKey
}

export type AuthProviderUserCounts = {
  local?: number
  ldap: number
  oidc: number
  header: number
}

export type ProviderLoginSummary = {
  available: boolean
  reason?: PublicProviderReasonCode
}

const PROVIDER_LABELS: Record<AuthProviderKey, string> = {
  local:  'Local',
  ldap:   'LDAP / AD',
  oidc:   'SSO',
  header: 'Bastion SSO',
}

const OIDC_LOGIN_PATH = '/api/auth/oidc/login'
const HEADER_LOGIN_PATH = '/api/auth/header/session'

export function isLdapConfigSufficientForLogin(ldap: AdminAuthProvidersDto['ldap']): boolean {
  return !!(
    ldap.url?.trim()
    && ldap.baseDn?.trim()
    && ldap.bindDn?.trim()
    && ldap.bindPasswordSet
    && ldap.userSearchFilter?.trim()
  )
}

export function isOidcConfigSufficientForLogin(oidc: AdminAuthProvidersDto['oidc']): boolean {
  return !!(
    oidc.issuer?.trim()
    && oidc.clientId?.trim()
    && oidc.clientSecretSet
  )
}

export function evaluateHeaderAvailability(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): ProviderLoginSummary {
  if (!dto.header.enabled) {
    return { available: false, reason: 'disabled' }
  }
  if (!isHeaderAuthConfigSufficientCore(dto.header)) {
    return { available: false, reason: 'config_incomplete' }
  }
  if (!dto.auth.jitEnabled && counts.header <= 0) {
    return { available: false, reason: 'no_provisioned_users' }
  }
  return { available: true }
}

export function evaluateLdapAvailability(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): ProviderLoginSummary {
  if (!dto.ldap.enabled) {
    return { available: false, reason: 'disabled' }
  }
  if (!isLdapConfigSufficientForLogin(dto.ldap)) {
    return { available: false, reason: 'config_incomplete' }
  }
  if (!dto.auth.jitEnabled && counts.ldap <= 0) {
    return { available: false, reason: 'no_provisioned_users' }
  }
  return { available: true }
}

export function evaluateOidcAvailability(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): ProviderLoginSummary {
  if (!dto.oidc.enabled) {
    return { available: false, reason: 'disabled' }
  }
  if (!isOidcConfigSufficientForLogin(dto.oidc)) {
    return { available: false, reason: 'config_incomplete' }
  }
  if (!dto.auth.jitEnabled && counts.oidc <= 0) {
    return { available: false, reason: 'no_provisioned_users' }
  }
  return { available: true }
}

/**
 * Build the public provider list for GET /api/auth/providers.
 */
export function buildPublicAuthProviders(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): PublicAuthProvidersResponse {
  const headerEval = evaluateHeaderAvailability(dto, counts)
  const ldapEval = evaluateLdapAvailability(dto, counts)
  const oidcEval = evaluateOidcAvailability(dto, counts)

  const providers: PublicAuthProvider[] = [
    {
      key:       'header',
      label:     PROVIDER_LABELS.header,
      available: headerEval.available,
      loginUrl:  headerEval.available ? HEADER_LOGIN_PATH : undefined,
      ...(headerEval.reason ? { reason: headerEval.reason } : {}),
    },
    {
      key:       'local',
      label:     PROVIDER_LABELS.local,
      available: true,
    },
    {
      key:       'ldap',
      label:     PROVIDER_LABELS.ldap,
      available: ldapEval.available,
      ...(ldapEval.reason ? { reason: ldapEval.reason } : {}),
    },
    {
      key:       'oidc',
      label:     PROVIDER_LABELS.oidc,
      available: oidcEval.available,
      loginUrl:  oidcEval.available ? OIDC_LOGIN_PATH : undefined,
      ...(oidcEval.reason ? { reason: oidcEval.reason } : {}),
    },
  ]

  // Transparent Bastion header first; then interactive SSO (OIDC), then local/LDAP.
  const priority: AuthProviderKey[] = ['header', 'oidc', 'local', 'ldap']
  const defaultProvider = priority.find((key) =>
    providers.find((p) => p.key === key)?.available,
  )

  return {
    providers,
    ...(defaultProvider ? { defaultProvider } : {}),
  }
}

/** Whether LDAP login endpoint should accept requests. */
export function isLdapLoginAvailable(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): boolean {
  return evaluateLdapAvailability(dto, counts).available
}

/** Whether OIDC login redirect should be allowed. */
export function isOidcLoginAvailable(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): boolean {
  return evaluateOidcAvailability(dto, counts).available
}

/** Whether Bastion trusted-header SSO should be attempted. */
export function isHeaderLoginAvailable(
  dto: AuthProvidersEvalDto,
  counts: AuthProviderUserCounts,
): boolean {
  return evaluateHeaderAvailability(dto, counts).available
}
