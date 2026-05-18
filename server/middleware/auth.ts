import { SESSION_COOKIE } from '../utils/jwt'
import {
  authenticateSessionFromToken,
  mapSessionAuthFailureToHttp,
} from '../utils/session-auth'
import type { UserRole } from '../utils/types'
import { enforceApiRbac } from '../utils/api-rbac'

/**
 * Middleware Nitro de protection + RBAC (cf. SDD v3.7).
 *
 * Toute route `/api/*` exige une session JWT valide, sauf la liste
 * blanche ci-dessous. La version de session (sessionVersion) est
 * vérifiée en BDD à chaque requête pour invalider les sessions
 * révoquées (désactivation / changement de mot de passe).
 *
 * POST / PUT / PATCH / DELETE : **refus par défaut** sauf règle
 * explicite — voir `server/utils/api-rbac.ts`.
 *
 * Routes WS (`/ws/*`) traitées séparément par leur propre handler.
 */

const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/providers',
  '/api/auth/oidc/login',
  '/api/auth/oidc/callback',
  '/api/auth/ldap/login',
  '/api/health',
  '/api/_nuxt_icon',
]

export default defineEventHandler(async (event) => {
  const path   = getRequestURL(event).pathname
  const method = event.method

  if (!path.startsWith('/api/')) return
  if (PUBLIC_API_PREFIXES.some((p) => path.startsWith(p))) return

  const token = getCookie(event, SESSION_COOKIE.name)
  const auth  = await authenticateSessionFromToken(token)
  if (!auth.ok) {
    const { statusCode, message } = mapSessionAuthFailureToHttp(auth.failure)
    throw createError({ statusCode, message })
  }

  event.context.user = {
    id:             auth.user.id,
    username:       auth.user.username,
    role:           auth.user.role as UserRole,
    sessionVersion: auth.user.sessionVersion,
  }

  const role = auth.user.role as string

  enforceApiRbac(path, method, role)
})
