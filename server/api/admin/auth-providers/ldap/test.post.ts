import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { assertSafeLdapLoginUsername } from '../../../../utils/ldap-filter-escape'
import { testLdapSettings, type LdapTestAction } from '../../../../utils/ldap-service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    bindPassword?: string
    username?:    string
    action?:      LdapTestAction
  }>(event).catch(() => ({}))

  const action: LdapTestAction | undefined = body.action
  if (body.username?.trim()) {
    assertSafeLdapLoginUsername(body.username.trim())
  }
  if (action === 'search' && !body.username?.trim()) {
    throw createError({
      statusCode: 400,
      message:    'Username required for user search test',
    })
  }

  const dto    = await buildAdminAuthProvidersDto()
  const result = await testLdapSettings(dto.ldap, {
    bindPasswordOverride: body.bindPassword,
    username:             body.username,
    action,
  })

  if (!result.ok) {
    return {
      ok:         false,
      error:      result.diagnostic.safeMessage,
      diagnostic: result.diagnostic,
    }
  }

  return {
    ok:                true,
    bindOk:            result.bindOk,
    searchSampleCount: result.searchSampleCount,
    diagnostic:        result.diagnostic,
    ...(result.connectOnly ? { connectOnly: true } : {}),
    ...(result.bindOnly ? { bindOnly: true } : {}),
    ...(result.userLookup !== undefined ? { userLookup: result.userLookup } : {}),
    ...(result.groupReadOk !== undefined ? { groupReadOk: result.groupReadOk } : {}),
  }
})
