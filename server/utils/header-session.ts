/**
 * Establish an esos_session from Bastion trusted headers (transparent SSO).
 */
import type { H3Event } from 'h3'
import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from './auth-providers-config'
import { countActiveUsersByAuthSource, type UserRow } from '../db/repositories/user.repository'
import { isHeaderLoginAvailable } from './auth-providers-public'
import {
  extractHeaderAuthIdentity,
  isHeaderAuthConfigSufficient,
  verifyHeaderAuthTrust,
} from './header-auth'
import { resolveHeaderLoginUser } from './header-user-resolve'
import { setSessionCookieForUser } from './auth-session-cookie'

export type HeaderSessionResult =
  | { ok: true; user: UserRow; createdSession: boolean }
  | { ok: false; reason: 'disabled' | 'untrusted' | 'no_identity' | 'inactive' | 'resolve_failed'; message?: string }

/**
 * Attempt header SSO. When successful, sets the session cookie.
 */
export async function tryEstablishHeaderSession(event: H3Event): Promise<HeaderSessionResult> {
  const dto = await buildAdminAuthProvidersDto()
  const headerCount = await countActiveUsersByAuthSource('header')
  if (!isHeaderLoginAvailable(dto, { ldap: 0, oidc: 0, header: headerCount })) {
    return { ok: false, reason: 'disabled' }
  }
  if (!isHeaderAuthConfigSufficient(dto.header)) {
    return { ok: false, reason: 'disabled' }
  }

  const secrets = await loadAuthProviderSecretsForServer()
  if (!verifyHeaderAuthTrust(event, dto.header, secrets.headerInternalToken)) {
    return { ok: false, reason: 'untrusted' }
  }

  const identity = extractHeaderAuthIdentity(event, dto.header)
  if (!identity) {
    return { ok: false, reason: 'no_identity' }
  }

  try {
    const user = await resolveHeaderLoginUser({ identity, dto })
    if (!user.active) {
      return { ok: false, reason: 'inactive' }
    }
    await setSessionCookieForUser(event, user)
    return { ok: true, user, createdSession: true }
  } catch (err) {
    return {
      ok: false,
      reason: 'resolve_failed',
      message: (err as Error)?.message,
    }
  }
}
