/**
 * Public auth provider visibility (login page). No secrets in output.
 */
import type { AdminAuthProvidersDto } from './auth-providers-config'

/** Settings slice used for login availability (no summary / counts). */
export type AuthProvidersEvalDto = Pick<AdminAuthProvidersDto, 'ldap' | 'oidc' | 'auth'>

export type AuthProviderKey = 'local' | 'ldap' | 'oidc'

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
}

export type ProviderLoginSummary = {
  available: boolean
  reason?: PublicProviderReasonCode
}

const PROVIDER_LABELS: Record<AuthProviderKey, string> = {
  local: 'Local',
  ldap:  'LDAP / AD',
  oidc:  'SSO',
}

const OIDC_LOGIN_PATH = '/api/auth/oidc/login'

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
  const ldapEval = evaluateLdapAvailability(dto, counts)
  const oidcEval = evaluateOidcAvailability(dto, counts)

  const providers: PublicAuthProvider[] = [
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

  const priority: AuthProviderKey[] = ['local', 'ldap', 'oidc']
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
