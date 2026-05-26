import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { assertSafeLdapSearchQuery } from '../../../../utils/ldap-filter-escape'
import { searchLdapDirectory } from '../../../../utils/ldap-directory'
import { resolveLdapBindPassword } from '../../../../utils/ldap-admin-bind'
import { recordLdapProvisioningEvent } from '../../../../utils/ldap-auth-events'
import { buildDirectorySearchFilter } from '../../../../utils/ldap-directory'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    query?:        string
    limit?:        number
    bindPassword?: string
  }>(event).catch(() => ({}))

  const query = body.query?.trim() ?? ''
  assertSafeLdapSearchQuery(query)

  const dto = await buildAdminAuthProvidersDto()
  if (!dto.ldap.enabled) {
    throw createError({ statusCode: 400, message: 'LDAP est désactivé' })
  }

  const bindPassword = await resolveLdapBindPassword(body.bindPassword)
  const limit        = Math.min(Math.max(body.limit ?? 25, 1), 50)
  const filter       = buildDirectorySearchFilter(dto.ldap, query)
  const startedAt    = Date.now()
  const requestIp    = getRequestIP(event) ?? undefined
  const userAgent    = getRequestHeader(event, 'user-agent') ?? undefined

  try {
    const { users, groups } = await searchLdapDirectory({
      dto,
      bindPassword,
      query,
      limit,
    })
    recordLdapProvisioningEvent({
      action:         'search',
      result:         'success',
      safeCode:       'search_ok',
      username:       query,
      dto:            dto.ldap,
      renderedFilter: filter,
      durationMs:     Date.now() - startedAt,
      requestIp,
      userAgent,
    })
    return { users, groups }
  } catch (e) {
    recordLdapProvisioningEvent({
      action:         'search',
      result:         'failure',
      safeCode:       'operations_error',
      username:       query,
      dto:            dto.ldap,
      renderedFilter: filter,
      message:        (e as { message?: string }).message,
      durationMs:     Date.now() - startedAt,
      requestIp,
      userAgent,
    })
    throw e
  }
})
