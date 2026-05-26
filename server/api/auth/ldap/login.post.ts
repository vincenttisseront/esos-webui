import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from '../../../utils/auth-providers-config'
import { isLdapLoginAvailable } from '../../../utils/auth-providers-public'
import {
  delayThenThrowInvalidCredentials,
  isSanitizedFederatedLoginFailure,
  ldapLoginSafeCodeFromError,
} from '../../../utils/auth-login-errors'
import { ldapLoginIdentityDiagnosticMessage, resolveLdapLoginIdentity } from '../../../utils/ldap-username-normalize'
import { buildLdapUserSearchFilter } from '../../../utils/ldap-service'
import { authenticateLdapUser } from '../../../utils/ldap-service'
import { assertSafeLdapLoginUsername } from '../../../utils/ldap-filter-escape'
import { resolveLdapLoginUser } from '../../../utils/ldap-user-resolve'
import { setSessionCookieForUser } from '../../../utils/auth-session-cookie'
import {
  countActiveUsersByAuthSource,
  recordLoginEvent,
} from '../../../db/repositories/user.repository'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ username?: string; password?: string }>(event)
  if (!body?.username || !body.password) {
    throw createError({
      statusCode: 400,
      message: 'Identifiants manquants',
      data: { code: 'auth.missing_credentials' },
    })
  }

  const dto = await buildAdminAuthProvidersDto()
  const ldapCount = await countActiveUsersByAuthSource('ldap')
  if (!isLdapLoginAvailable(dto, { ldap: ldapCount, oidc: 0 })) {
    throw createError({ statusCode: 404, message: 'Connexion LDAP non disponible' })
  }

  assertSafeLdapLoginUsername(body.username)

  const ip        = getRequestIP(event) ?? undefined
  const userAgent = getRequestHeader(event, 'user-agent') ?? undefined

  const { ldapBindPassword } = await loadAuthProviderSecretsForServer()
  const identity     = resolveLdapLoginIdentity(body.username, dto.ldap)
  const loginFilter  = buildLdapUserSearchFilter(dto.ldap, body.username)
  const identityLog  = ldapLoginIdentityDiagnosticMessage(identity)

  let ldapMatchedDn: string | undefined

  try {
    const row = await authenticateLdapUser(
      dto.ldap,
      ldapBindPassword,
      body.username,
      body.password,
      { requestIp: ip, userAgent },
    )
    ldapMatchedDn = row.dn
    const user = await resolveLdapLoginUser({ ldapRow: row, loginName: body.username, dto })
    if (!user.active) {
      const { recordLdapLoginEvent } = await import('../../../utils/ldap-auth-events')
      recordLdapLoginEvent({
        step:              'roleMapping',
        result:            'failure',
        safeCode:          'insufficient_access',
        username:          body.username,
        dto:               dto.ldap,
        renderedFilter:    loginFilter,
        diagnosticMessage: identityLog,
        matchedDn:         ldapMatchedDn,
        requestIp:         ip,
        userAgent,
      })
      await recordLoginEvent(user.id, false, ip, userAgent).catch(() => {/* ignore */})
      await new Promise((r) => setTimeout(r, 500))
      throw createError({
        statusCode: 401,
        message: 'Identifiants incorrects',
        data: { code: 'auth.invalid_credentials' },
      })
    }
    await setSessionCookieForUser(event, user)
    return {
      user: {
        id:                  user.id,
        username:            user.username,
        role:                user.role,
        active:              user.active,
        authSource:          user.authSource ?? 'ldap',
        forcePasswordChange: user.forcePasswordChange,
        preferredLocale:     user.preferredLocale ?? null,
        preferredTheme:      user.preferredTheme ?? null,
      },
    }
  } catch (e) {
    if (isSanitizedFederatedLoginFailure(e)) {
      const { recordLdapLoginEvent } = await import('../../../utils/ldap-auth-events')
      const safeCode = ldapLoginSafeCodeFromError(e) ?? 'user_not_imported'
      recordLdapLoginEvent({
        step:              'roleMapping',
        result:            'failure',
        safeCode,
        username:          body.username,
        dto:               dto.ldap,
        renderedFilter:    loginFilter,
        diagnosticMessage: identityLog,
        matchedDn:         ldapMatchedDn,
        durationMs:        0,
        requestIp:         ip,
        userAgent,
      })
      await delayThenThrowInvalidCredentials()
    }
    if ((e as { statusCode?: number }).statusCode) throw e
    await delayThenThrowInvalidCredentials()
  }
})
