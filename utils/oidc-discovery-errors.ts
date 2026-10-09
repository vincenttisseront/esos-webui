/**
 * Classify openid-client / oauth4webapi discovery failures for admin UI.
 * Pure helpers — no server imports.
 */

export type OidcDiscoveryErrorCode =
  | 'issuer_mismatch'
  | 'http_status'
  | 'network'
  | 'invalid_issuer'
  | 'timeout'
  | 'unknown'

export type OidcDiscoveryFailure = {
  ok: false
  code: OidcDiscoveryErrorCode
  /** Short technical fallback (English library message or summary). */
  error: string
  expectedIssuer?: string
  discoveredIssuer?: string
  httpStatus?: number
  discoveryUrl?: string
}

export type OidcDiscoverySuccess = {
  ok: true
  authorizationEndpoint: boolean
  tokenEndpoint: boolean
  jwksUri: boolean
}

export type OidcDiscoveryTestResult = OidcDiscoverySuccess | OidcDiscoveryFailure

/** Strip trailing slashes so Keycloak issuer matches discovery metadata. */
export function normalizeOidcIssuer(issuer: string): string {
  return issuer.trim().replace(/\/+$/, '')
}

export function oidcDiscoveryUrl(issuer: string): string {
  const base = normalizeOidcIssuer(issuer)
  return `${base}/.well-known/openid-configuration`
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function digCause(err: unknown): Record<string, unknown> | null {
  const top = asRecord(err)
  if (!top) return null
  const cause = asRecord(top.cause)
  if (cause) return cause
  return null
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  const r = asRecord(err)
  if (typeof r?.message === 'string') return r.message
  return 'OIDC discovery failed'
}

function httpStatusFrom(err: unknown, cause: Record<string, unknown> | null): number | undefined {
  const top = asRecord(err)
  for (const candidate of [cause, top]) {
    if (!candidate) continue
    if (typeof candidate.status === 'number') return candidate.status
    if (typeof candidate.statusCode === 'number') return candidate.statusCode
    const response = asRecord(candidate.response) ?? (candidate instanceof Response ? null : null)
    if (response && typeof response.status === 'number') return response.status
  }
  // oauth4webapi may attach the Response as cause directly
  if (err && typeof err === 'object' && 'cause' in err) {
    const c = (err as { cause: unknown }).cause
    if (typeof Response !== 'undefined' && c instanceof Response) return c.status
    if (c && typeof c === 'object' && typeof (c as Response).status === 'number') {
      return (c as { status: number }).status
    }
  }
  return undefined
}

function discoveredIssuerFromCause(cause: Record<string, unknown> | null): string | undefined {
  if (!cause) return undefined
  const body = asRecord(cause.body)
  if (typeof body?.issuer === 'string' && body.issuer.trim()) return body.issuer.trim()
  if (typeof cause.issuer === 'string' && cause.issuer.trim()) return cause.issuer.trim()
  return undefined
}

function expectedIssuerFromCause(cause: Record<string, unknown> | null): string | undefined {
  if (!cause) return undefined
  if (typeof cause.expected === 'string' && cause.expected.trim()) {
    return normalizeOidcIssuer(cause.expected)
  }
  return undefined
}

export function classifyOidcDiscoveryError(
  err: unknown,
  configuredIssuer?: string,
): OidcDiscoveryFailure {
  const msg = messageOf(err)
  const lower = msg.toLowerCase()
  const cause = digCause(err)
  const expected =
    expectedIssuerFromCause(cause)
    || (configuredIssuer ? normalizeOidcIssuer(configuredIssuer) : undefined)
  const discovered = discoveredIssuerFromCause(cause)
  const discoveryUrl = configuredIssuer ? oidcDiscoveryUrl(configuredIssuer) : undefined
  const httpStatus = httpStatusFrom(err, cause)

  if (
    lower.includes('does not match the expected issuer')
    || lower.includes('does not match the expected value')
    || (cause?.attribute === 'issuer')
  ) {
    return {
      ok: false,
      code: 'issuer_mismatch',
      error: msg,
      expectedIssuer: expected,
      discoveredIssuer: discovered,
      discoveryUrl,
    }
  }

  if (
    lower.includes('unexpected http status')
    || lower.includes('unexpected http response')
    || lower.includes('not a conform authorization server metadata')
  ) {
    return {
      ok: false,
      code: 'http_status',
      error: msg,
      expectedIssuer: expected,
      httpStatus,
      discoveryUrl,
    }
  }

  if (
    lower.includes('timeout')
    || lower.includes('aborted')
    || (err instanceof Error && err.name === 'TimeoutError')
    || (err instanceof Error && err.name === 'AbortError')
  ) {
    return {
      ok: false,
      code: 'timeout',
      error: msg,
      expectedIssuer: expected,
      discoveryUrl,
    }
  }

  if (
    lower.includes('invalid url')
    || lower.includes('invalid issuer')
    || lower.includes('failed to parse')
  ) {
    return {
      ok: false,
      code: 'invalid_issuer',
      error: msg,
      expectedIssuer: expected,
      discoveryUrl,
    }
  }

  if (
    lower.includes('fetch failed')
    || lower.includes('econnrefused')
    || lower.includes('enotfound')
    || lower.includes('cert')
    || lower.includes('ssl')
    || lower.includes('network')
    || lower.includes('getaddrinfo')
  ) {
    return {
      ok: false,
      code: 'network',
      error: msg,
      expectedIssuer: expected,
      discoveryUrl,
    }
  }

  return {
    ok: false,
    code: 'unknown',
    error: msg,
    expectedIssuer: expected,
    discoveredIssuer: discovered,
    httpStatus,
    discoveryUrl,
  }
}

/** i18n key under admin.authProviders.oidc.testErrors.* */
export function oidcDiscoveryErrorI18nKey(code: OidcDiscoveryErrorCode): string {
  return `admin.authProviders.oidc.testErrors.${code}`
}

export function oidcDiscoveryHintI18nKey(code: OidcDiscoveryErrorCode): string | null {
  if (code === 'issuer_mismatch' || code === 'http_status' || code === 'invalid_issuer') {
    return `admin.authProviders.oidc.testErrors.${code}_hint`
  }
  if (code === 'network' || code === 'timeout') {
    return `admin.authProviders.oidc.testErrors.${code}_hint`
  }
  return null
}
