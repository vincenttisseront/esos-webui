/** Client-side session cookie name (httpOnly — not readable from `document.cookie`). */
export const SESSION_COOKIE_NAME = 'esos_session'

/** Routes where no session is expected; skip `/api/auth/me` to avoid noisy 401s. */
export function shouldSkipAuthMeFetch(path: string): boolean {
  return path === '/login' || path.startsWith('/login/')
}
