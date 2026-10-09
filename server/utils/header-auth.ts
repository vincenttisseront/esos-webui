/**
 * Bastion Pro / nginx trusted-header SSO — extract identity from reverse-proxy headers.
 *
 * Prefer a shared internal token (X-ESOS-Auth-Token). When requireInternalToken is
 * false and no token is configured, headers are accepted only from a private /
 * loopback TCP peer (app must not be exposed publicly without the proxy).
 */
import type { H3Event } from 'h3'
import { getRequestHeader, getRequestIP } from 'h3'
import { timingSafeEqual, createHash } from 'node:crypto'
import { isIP } from 'node:net'
import type { AdminAuthProvidersDto } from './auth-providers-config'

export type HeaderAuthIdentity = {
  username: string
  email?: string
  groups: string[]
  displayName?: string
  /** Synthetic claims for role mapping (OIDC-style). */
  claims: Record<string, unknown>
}

/** Bastion / Authelia / nginx common identity header names. */
export const HEADER_USER_FALLBACKS = [
  'X-Remote-User',
  'Remote-User',
  'X-Forwarded-User',
] as const

export const HEADER_EMAIL_FALLBACKS = [
  'X-Remote-Email',
  'Remote-Email',
  'X-Forwarded-Email',
] as const

export const HEADER_GROUPS_FALLBACKS = [
  'X-Remote-Groups',
  'Remote-Groups',
  'X-Forwarded-Groups',
] as const

export const HEADER_DISPLAY_NAME_FALLBACKS = [
  'X-Remote-Name',
  'Remote-Name',
  'X-Remote-Preferred-Username',
  'X-Forwarded-Preferred-Username',
] as const

function header(event: H3Event, name: string): string | undefined {
  if (!name.trim()) return undefined
  const v = getRequestHeader(event, name.trim())
  if (v == null) return undefined
  const s = String(v).trim()
  return s || undefined
}

function firstHeader(event: H3Event, primary: string, fallbacks: readonly string[]): string | undefined {
  const fromPrimary = header(event, primary)
  if (fromPrimary) return fromPrimary
  const primaryLc = primary.trim().toLowerCase()
  for (const name of fallbacks) {
    if (name.toLowerCase() === primaryLc) continue
    const v = header(event, name)
    if (v) return v
  }
  return undefined
}

function safeEqualString(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    const octet = Number(p)
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null
    n = (n << 8) + octet
  }
  return n >>> 0
}

/** True for loopback / RFC1918 / link-local / ULA — typical Bastion→app peer. */
export function isPrivateOrLoopbackIp(ip: string | null | undefined): boolean {
  if (!ip) return false
  const raw = ip.trim().replace(/^\[|\]$/g, '')
  if (!raw) return false

  if (raw === '::1' || raw === '0:0:0:0:0:0:0:1') return true
  if (raw.startsWith('fe80:') || raw.startsWith('FE80:')) return true
  if (raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('FC') || raw.startsWith('FD')) {
    // Unique local addresses fc00::/7
    if (raw.includes(':')) return true
  }

  // IPv4-mapped IPv6 ::ffff:a.b.c.d
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  const v4 = mapped?.[1] ?? (raw.includes(':') ? null : raw)
  if (!v4) return false
  if (isIP(v4) !== 4) return false
  if (v4 === '127.0.0.1' || v4.startsWith('127.')) return true
  const n = ipv4ToInt(v4)
  if (n == null) return false
  const b0 = (n >>> 24) & 0xff
  const b1 = (n >>> 16) & 0xff
  // 10.0.0.0/8
  if (b0 === 10) return true
  // 172.16.0.0/12
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true
  // 192.168.0.0/16
  if (b0 === 192 && b1 === 168) return true
  // 169.254.0.0/16 link-local
  if (b0 === 169 && b1 === 254) return true
  return false
}

export function isTrustedHeaderProxyPeer(event: H3Event): boolean {
  // Do not honor X-Forwarded-For here — only the direct TCP peer (Bastion/nginx).
  const ip = getRequestIP(event, { xForwardedFor: false })
  return isPrivateOrLoopbackIp(ip)
}

export function isHeaderAuthConfigSufficient(
  h: AdminAuthProvidersDto['header'],
): boolean {
  const tokenFromEnv = !!(process.env.AUTH_HEADER_INTERNAL_TOKEN?.trim())
  const trustWithoutToken =
    process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN === '1'
    || process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN === 'true'
  const tokenOk = h.internalTokenSet || tokenFromEnv
  const requireToken = h.requireInternalToken !== false && !trustWithoutToken
  return !!(
    h.enabled
    && h.userHeader?.trim()
    && h.issuer?.trim()
    && (!requireToken || (h.tokenHeader?.trim() && tokenOk))
  )
}

/**
 * Verify trust for Bastion/nginx injected headers.
 * Env AUTH_HEADER_INTERNAL_TOKEN overrides DB secret when set (Docker).
 */
export function verifyHeaderAuthTrust(
  event: H3Event,
  cfg: AdminAuthProvidersDto['header'],
  internalToken: string | null | undefined,
): boolean {
  const expected = (process.env.AUTH_HEADER_INTERNAL_TOKEN?.trim() || internalToken?.trim() || '')
  if (expected) {
    const presented = header(event, cfg.tokenHeader)
    if (!presented) return false
    return safeEqualString(presented, expected)
  }

  const trustWithoutToken =
    process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN === '1'
    || process.env.AUTH_HEADER_TRUST_WITHOUT_TOKEN === 'true'
  const requireToken = cfg.requireInternalToken !== false && !trustWithoutToken
  if (requireToken) return false

  // No shared secret: only accept from private/loopback reverse-proxy peer
  // and only when an identity header is actually present.
  if (!isTrustedHeaderProxyPeer(event)) return false
  return !!firstHeader(event, cfg.userHeader, HEADER_USER_FALLBACKS)
}

export function extractHeaderAuthIdentity(
  event: H3Event,
  cfg: AdminAuthProvidersDto['header'],
): HeaderAuthIdentity | null {
  const username = firstHeader(event, cfg.userHeader, HEADER_USER_FALLBACKS)
  if (!username) return null

  const email = cfg.emailHeader
    ? firstHeader(event, cfg.emailHeader, HEADER_EMAIL_FALLBACKS)
    : firstHeader(event, '', HEADER_EMAIL_FALLBACKS)
  const groupsRaw = cfg.groupsHeader
    ? firstHeader(event, cfg.groupsHeader, HEADER_GROUPS_FALLBACKS)
    : undefined
  const delim = cfg.groupsDelimiter || ','
  const groups = groupsRaw
    ? groupsRaw.split(delim).map((g) => g.trim()).filter(Boolean)
    : []

  const displayName = cfg.displayNameHeader
    ? firstHeader(event, cfg.displayNameHeader, HEADER_DISPLAY_NAME_FALLBACKS)
    : firstHeader(event, '', HEADER_DISPLAY_NAME_FALLBACKS)

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
