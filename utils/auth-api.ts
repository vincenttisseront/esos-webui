/**
 * Client-side auth API helpers (401 detection, public routes).
 */
import { shouldSkipAuthMeFetch } from '~/utils/auth-client'

const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/providers',
  '/api/auth/ldap/login',
  '/api/auth/oidc/login',
  '/api/auth/oidc/callback',
  '/api/health',
  '/api/app/version',
  '/api/_nuxt_icon',
] as const

export function normalizeApiPath(request: string | Request): string {
  const raw = typeof request === 'string' ? request : request.url
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return new URL(raw).pathname
    }
  } catch { /* ignore */ }
  const path = raw.split('?')[0] ?? raw
  return path.startsWith('/') ? path : `/${path}`
}

export function isPublicApiPath(request: string | Request): boolean {
  const path = normalizeApiPath(request)
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

export function isUnauthorizedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as {
    statusCode?: number
    status?: number
    response?: { status?: number }
  }
  return e.statusCode === 401 || e.status === 401 || e.response?.status === 401
}

/** Whether a 401 should clear session and stop app polling. */
export function shouldHandleUnauthorized(request: string | Request): boolean {
  const path = normalizeApiPath(request)
  if (isPublicApiPath(path)) return false
  if (path === '/api/auth/me') return true
  return path.startsWith('/api/')
}

