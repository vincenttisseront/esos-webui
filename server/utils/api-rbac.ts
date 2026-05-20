import { createError } from 'h3'

/**
 * RBAC pour les routes `/api/*` (utilisé par server/middleware/auth.ts).
 * Extrait pour tests Vitest sans charger Nitro.
 *
 * Rôles en chaîne (alignés sur `UserRole` dans ./types) — pas d'import runtime
 * de ./types pour garder ce module léger sous Vitest.
 */

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | '*'
type RbacRole = 'admin' | 'operator' | 'viewer'
type RoutePermission = [RegExp, Method[], RbacRole[]]

export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Mutations autorisées explicitement (ordre : spécifique → général). Viewer-safe : logout, change-password. */
export const MUTATION_ROUTE_PERMISSIONS: RoutePermission[] = [
  [/^\/api\/auth\/logout$/, ['POST'], ['admin', 'operator', 'viewer']],
  [/^\/api\/auth\/change-password$/, ['POST'], ['admin', 'operator', 'viewer']],

  [/^\/api\/admin\/ssh\/test$/, ['POST'], ['admin']],

  [/^\/api\/admin\/auth-providers/, ['*'], ['admin']],

  [/^\/api\/admin\/users/, ['*'], ['admin']],
  [/^\/api\/san\/[^/]+\/system-config/, ['POST', 'PATCH', 'DELETE'], ['admin']],
  [/^\/api\/admin\/sans\/[^/]+$/, ['DELETE'], ['admin']],
  [/^\/api\/admin\/sans\/[^/]+\/reconnect$/, ['POST'], ['admin', 'operator']],
  [/^\/api\/admin\/dependencies/, ['*'], ['admin', 'operator']],

  [/^\/api\/perf\/(?:config|service|db-test|devices)/, ['*'], ['admin', 'operator']],
  [/^\/api\/raid\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],

  [/^\/api\/lvm\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],

  [/^\/api\/cluster\//, ['POST', 'PUT', 'PATCH', 'DELETE'], ['admin', 'operator']],

  [/^\/api\/targets/, ['POST', 'PATCH', 'DELETE'], ['admin', 'operator']],
  [/^\/api\/devices/, ['POST', 'DELETE'], ['admin', 'operator']],

  [/^\/api\/san\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],

  [/^\/api\/admin\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin']],
]

/** Lectures : première règle path+méthode qui matche impose les rôles ; sinon autorisé.
 * Sous /api/admin/ en GET/HEAD : allowlist opérateur explicite, puis défaut admin (Batch 2A).
 */
export const READ_ROUTE_PERMISSIONS: RoutePermission[] = [
  [/^\/api\/admin\/users/, ['*'], ['admin']],
  [/^\/api\/admin\/auth-providers/, ['*'], ['admin']],
  [/^\/api\/san\/[^/]+\/system-config/, ['POST', 'PATCH', 'DELETE'], ['admin']],
  [/^\/api\/admin\/sans\/[^/]+$/, ['DELETE'], ['admin']],
  [/^\/api\/admin\/dependencies/, ['*'], ['admin', 'operator']],
  [/^\/api\/perf\/(?:config|service|db-test|devices)/, ['*'], ['admin', 'operator']],
  [/^\/api\/perf\//, ['GET'], ['admin', 'operator', 'viewer']],
  [/^\/api\/raid\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],
  [/^\/api\/raid\//, ['GET'], ['admin', 'operator', 'viewer']],
  [/^\/api\/lvm\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],
  [/^\/api\/lvm\//, ['GET'], ['admin', 'operator', 'viewer']],
  [/^\/api\/san\/[^/]+\/system-config/, ['GET'], ['admin', 'operator']],
  [/^\/api\/san\//, ['POST', 'PATCH', 'PUT', 'DELETE'], ['admin', 'operator']],

  // Contexte de sélection SAN/cluster (Batch 2A.1a) — DTO minimal, tous rôles authentifiés
  [/^\/api\/context\/selection$/, ['GET', 'HEAD'], ['admin', 'operator', 'viewer']],

  // GET/HEAD /api/admin/* — opérateur uniquement sur ces préfixes (avant catch-all admin)
  [/^\/api\/admin\/sans(\/|$)/, ['GET', 'HEAD'], ['admin', 'operator']],
  [/^\/api\/admin\/clusters(\/|$)/, ['GET', 'HEAD'], ['admin', 'operator']],
  [/^\/api\/admin\/login-history$/, ['GET', 'HEAD'], ['admin', 'operator']],
  [/^\/api\/admin\/app-version(\/|$)/, ['GET', 'HEAD'], ['admin', 'operator']],
  [/^\/api\/admin\/health$/, ['GET', 'HEAD'], ['admin', 'operator']],
  [/^\/api\/admin\/esos-version(\/|$)/, ['GET', 'HEAD'], ['admin', 'operator']],
  // Tout autre GET/HEAD sous /api/admin/ : admin seul (p.ex. settings, system-info, cluster/probe)
  [/^\/api\/admin\//, ['GET', 'HEAD'], ['admin']],
]

export function methodMatches(methods: Method[], method: string): boolean {
  return methods.includes('*') || (methods as string[]).includes(method)
}

export function enforceMutationAccess(path: string, method: string, role: string): void {
  for (const [pattern, methods, roles] of MUTATION_ROUTE_PERMISSIONS) {
    if (!pattern.test(path)) continue
    if (!methodMatches(methods, method)) continue

    if (!(roles as string[]).includes(role)) {
      throw createError({
        statusCode: 403,
        message:    `Accès refusé. Rôle requis : ${roles.join(' ou ')}.`,
      })
    }
    return
  }

  throw createError({
    statusCode: 403,
    message:    'Accès refusé pour cette opération.',
  })
}

export function enforceReadAccess(path: string, method: string, role: string): void {
  for (const [pattern, methods, roles] of READ_ROUTE_PERMISSIONS) {
    if (!pattern.test(path)) continue
    if (!methodMatches(methods, method)) continue

    if (!(roles as string[]).includes(role)) {
      throw createError({
        statusCode: 403,
        message:    `Accès refusé. Rôle requis : ${roles.join(' ou ')}.`,
      })
    }
    return
  }
}

export function enforceApiRbac(path: string, method: string, role: string): void {
  if (MUTATING_METHODS.has(method)) {
    enforceMutationAccess(path, method, role)
  } else {
    enforceReadAccess(path, method, role)
  }
}
