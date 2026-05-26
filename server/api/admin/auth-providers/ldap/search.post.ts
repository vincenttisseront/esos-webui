import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { assertSafeLdapSearchQuery } from '../../../../utils/ldap-filter-escape'
import { searchLdapDirectory } from '../../../../utils/ldap-directory'
import { resolveLdapBindPassword } from '../../../../utils/ldap-admin-bind'

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

  const { users, groups } = await searchLdapDirectory({
    dto,
    bindPassword,
    query,
    limit,
  })

  return { users, groups }
})
