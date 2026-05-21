import { getUserById } from '../db/repositories/user.repository'
import { SESSION_COOKIE, verifySession } from './jwt'
import type { UserRole } from './types'

export interface AuthenticatedSessionUser {
  id:             string
  username:       string
  role:           UserRole
  sessionVersion: number
}

export type SessionAuthFailureCode =
  | 'missing_token'
  | 'invalid_token'
  | 'user_not_found'
  | 'inactive'
  | 'session_revoked'

export interface SessionAuthFailure {
  code: SessionAuthFailureCode
}

/**
 * Extract a single cookie value from a raw `Cookie` header (same-origin HTTP / WS upgrade).
 * Does not decode URI — session token is URL-safe JWT.
 */
export function extractSessionTokenFromCookieHeader(
  cookieHeader: string | undefined | null,
  cookieName: string,
): string | undefined {
  if (!cookieHeader || !cookieName) return undefined
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name  = part.slice(0, idx).trim()
    let value   = part.slice(idx + 1).trim()
    if (name === cookieName && value.length > 0) {
      try {
        value = decodeURIComponent(value)
      } catch { /* use raw */ }
      return value
    }
  }
  return undefined
}

/** Read Cookie header from Node IncomingMessage (WS upgrade). */
export function readCookieHeaderFromIncomingMessage(
  req: { headers?: { cookie?: string | string[] } } | undefined,
): string | undefined {
  if (!req?.headers) return undefined
  const c = req.headers.cookie
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.join('; ')
  return undefined
}

export function mapSessionAuthFailureToHttp(failure: SessionAuthFailure): { statusCode: number; message: string } {
  switch (failure.code) {
    case 'missing_token':
      return { statusCode: 401, message: 'Non authentifié' }
    case 'invalid_token':
      return { statusCode: 401, message: 'Session expirée' }
    case 'user_not_found':
      return { statusCode: 401, message: 'Compte introuvable' }
    case 'inactive':
      return { statusCode: 403, message: 'Compte désactivé. Contactez un administrateur.' }
    case 'session_revoked':
      return { statusCode: 401, message: 'Session révoquée. Reconnectez-vous.' }
  }
}

/**
 * Same JWT + DB checks as `server/middleware/auth.ts` (Batch 2B.6 — shared for `/ws/terminal`).
 */
export async function authenticateSessionFromToken(
  token: string | undefined | null,
): Promise<{ ok: true; user: AuthenticatedSessionUser } | { ok: false; failure: SessionAuthFailure }> {
  if (!token) {
    return { ok: false, failure: { code: 'missing_token' } }
  }

  let payload: Awaited<ReturnType<typeof verifySession>>
  try {
    payload = await verifySession(token)
  } catch {
    return { ok: false, failure: { code: 'invalid_token' } }
  }

  const user = await getUserById(payload.userId)
  if (!user) {
    return { ok: false, failure: { code: 'user_not_found' } }
  }
  if (!user.active) {
    return { ok: false, failure: { code: 'inactive' } }
  }
  if (user.sessionVersion !== payload.sessionVersion) {
    return { ok: false, failure: { code: 'session_revoked' } }
  }

  return {
    ok: true,
    user: {
      id:             user.id,
      username:       user.username,
      role:           user.role as UserRole,
      sessionVersion: user.sessionVersion,
    },
  }
}

/** Batch 2B.6 — terminal WS: admin and operator only (not viewer). */
export function isTerminalWebSocketRoleAllowed(role: UserRole): boolean {
  return role === 'admin' || role === 'operator'
}

export function terminalWsCloseReasonFromFailure(failure: SessionAuthFailure): string {
  return `esos:${failure.code}`
}

export function terminalWsUserMessageFromFailure(failure: SessionAuthFailure): string {
  switch (failure.code) {
    case 'inactive':
      return 'Droits insuffisants.'
    case 'missing_token':
    case 'invalid_token':
    case 'user_not_found':
    case 'session_revoked':
      return 'Session expirée. Reconnectez-vous.'
    default:
      return 'Session expirée. Reconnectez-vous.'
  }
}
