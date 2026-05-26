import type { UserPublic } from './types'

export type UserAuthSource = 'local' | 'ldap' | 'oidc' | 'unknown'

export type AuthSourceFilter = 'all' | UserAuthSource

export function normalizeUserAuthSource(
  source: string | null | undefined,
): UserAuthSource {
  if (source === 'local' || source === 'ldap' || source === 'oidc') return source
  return 'unknown'
}

export function isLocalAuthSource(source: string | null | undefined): boolean {
  return normalizeUserAuthSource(source) === 'local'
}

/** Admin password reset applies only to local accounts. */
export function canAdminResetUserPassword(
  user: Pick<UserPublic, 'authSource'>,
): boolean {
  return isLocalAuthSource(user.authSource)
}

export function filterUsersByAuthSource<T extends Pick<UserPublic, 'authSource'>>(
  users: T[],
  filter: AuthSourceFilter,
): T[] {
  if (filter === 'all') return users
  return users.filter((u) => normalizeUserAuthSource(u.authSource) === filter)
}

/** Short provider label from issuer URL (LDAP host or OIDC issuer). */
export function externalProviderLabel(
  user: Pick<UserPublic, 'externalIssuer'>,
): string | null {
  const raw = user.externalIssuer?.trim()
  if (!raw) return null
  try {
    const normalized = raw.includes('://') ? raw : `ldap://${raw}`
    return new URL(normalized).host || raw
  } catch {
    return raw.length > 48 ? `${raw.slice(0, 47)}…` : raw
  }
}

/** Preferred external identifier for admin display. */
export function externalIdentityDisplay(
  user: Pick<UserPublic, 'externalLogin' | 'externalEmail' | 'externalSubject'>,
): string | null {
  return (
    user.externalLogin?.trim()
    || user.externalEmail?.trim()
    || user.externalSubject?.trim()
    || null
  )
}

export const AUTH_SOURCE_BADGE: Record<
  UserAuthSource,
  { icon: string; classes: string }
> = {
  local:   { icon: 'i-heroicons-key', classes: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  ldap:    { icon: 'i-heroicons-building-office-2', classes: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  oidc:    { icon: 'i-heroicons-globe-alt', classes: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300' },
  unknown: { icon: 'i-heroicons-question-mark-circle', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
}
