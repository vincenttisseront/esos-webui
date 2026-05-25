import type { UserRole } from '~/server/utils/types'

/** Global WebUI RBAC: only admins may change auth provider configuration. */
export function canEditAuthProviders(role: UserRole | null | undefined): boolean {
  return role === 'admin'
}

export function authProvidersReadOnly(role: UserRole | null | undefined): boolean {
  return !canEditAuthProviders(role)
}

/** GET /api/admin/auth-providers is allowed for admin, operator, and viewer. */
export function canViewAuthProviders(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'operator' || role === 'viewer'
}
