/**
 * Bastion Pro trusted_headers SSO — extract identity from reverse-proxy headers.
 *
 * Headers are only trusted when the shared internal token matches
 * (same pattern as Bastion X-Portal-Internal-Token). Never trust raw
 * X-Forwarded-User from the public internet.
 */
import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { timingSafeEqual, createHash } from 'node:crypto'
import type { AdminAuthProvidersDto } from './auth-providers-config'

export type HeaderAuthIdentity = {
  username: string
  email?: string
  groups: string[]
  displayName?: string
  /** Synthetic claims for role mapping (OIDC-style). */
  claims: Record<string, unknown>
}

function header(event: H3Event, name: string): string | undefined {
  if (!name.trim()) return undefined
  const v = getRequestHeader(event, name.trim())
  if (v == null) return undefined
  const s = String(v).trim()
  return s || undefined
}

function safeEqualString(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function isHeaderAuthConfigSufficient(
  h: AdminAuthProvidersDto['header'],
): boolean {
  const tokenFromEnv = !!(process.env.AUTH_HEADER_INTERNAL_TOKEN?.trim())
  return !!(
    h.enabled
    && h.userHeader?.trim()
    && h.issuer?.trim()
    && h.tokenHeader?.trim()
    && (h.internalTokenSet || tokenFromEnv)
  )
}

/**
 * Verify the internal token from Bastion/nginx.
 * Env AUTH_HEADER_INTERNAL_TOKEN overrides DB secret when set (Docker).
 */
export function verifyHeaderAuthTrust(
  event: H3Event,
  cfg: AdminAuthProvidersDto['header'],
  internalToken: string | null | undefined,
): boolean {
  const expected = (process.env.AUTH_HEADER_INTERNAL_TOKEN?.trim() || internalToken?.trim() || '')
  if (!expected) return false
  const presented = header(event, cfg.tokenHeader)
  if (!presented) return false
  return safeEqualString(presented, expected)
}

export function extractHeaderAuthIdentity(
  event: H3Event,
  cfg: AdminAuthProvidersDto['header'],
): HeaderAuthIdentity | null {
  const username = header(event, cfg.userHeader)
  if (!username) return null

  const email = cfg.emailHeader ? header(event, cfg.emailHeader) : undefined
  const groupsRaw = cfg.groupsHeader ? header(event, cfg.groupsHeader) : undefined
  const delim = cfg.groupsDelimiter || ','
  const groups = groupsRaw
    ? groupsRaw.split(delim).map((g) => g.trim()).filter(Boolean)
    : []

  const displayName = cfg.displayNameHeader
    ? header(event, cfg.displayNameHeader)
    : undefined

  const claims: Record<string, unknown> = {
    preferred_username: username,
    sub: username,
    groups,
  }
  if (email) {
    claims.email = email
    claims.email_verified = true
  }
  if (displayName) claims.name = displayName

  return {
    username,
    email,
    groups,
    displayName,
    claims,
  }
}
