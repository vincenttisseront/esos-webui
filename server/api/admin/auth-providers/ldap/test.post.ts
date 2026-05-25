import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { testLdapSettings } from '../../../../utils/ldap-service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ bindPassword?: string; username?: string }>(event).catch(() => ({}))
  const dto    = await buildAdminAuthProvidersDto()
  const result = await testLdapSettings(dto.ldap, {
    bindPasswordOverride: body.bindPassword,
    username:           body.username,
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
    ...(result.userLookup !== undefined ? { userLookup: result.userLookup } : {}),
  }
})
