import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from '../../../utils/auth-providers-config'
import { authenticateLdapUser } from '../../../utils/ldap-service'
import { assertSafeLdapLoginUsername } from '../../../utils/ldap-filter-escape'
import { resolveLdapLoginUser } from '../../../utils/ldap-user-resolve'
import { setSessionCookieForUser } from '../../../utils/auth-session-cookie'
import { recordLoginEvent } from '../../../db/repositories/user.repository'

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
  if (!dto.ldap.enabled) {
    throw createError({ statusCode: 404, message: 'Connexion LDAP non disponible' })
  }

  assertSafeLdapLoginUsername(body.username)

  const ip        = getRequestIP(event) ?? undefined
  const userAgent = getRequestHeader(event, 'user-agent') ?? undefined

  const { ldapBindPassword } = await loadAuthProviderSecretsForServer()

  try {
    const row = await authenticateLdapUser(dto.ldap, ldapBindPassword, body.username, body.password)
    const user = await resolveLdapLoginUser({ ldapRow: row, loginName: body.username, dto })
    if (!user.active) {
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
      },
    }
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) throw e
    await new Promise((r) => setTimeout(r, 500))
    throw createError({
      statusCode: 401,
      message: 'Identifiants incorrects',
      data: { code: 'auth.invalid_credentials' },
    })
  }
})
