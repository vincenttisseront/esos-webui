import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from '../../../../utils/auth-providers-config'
import { testLdapSettings } from '../../../../utils/ldap-service'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ bindPassword?: string }>(event).catch(() => ({}))
  const dto    = await buildAdminAuthProvidersDto()
  const result = await testLdapSettings(dto.ldap, body.bindPassword)
  if (!result.ok) {
    return { ok: false, error: result.error }
  }
  return {
    ok:                true,
    bindOk:            result.bindOk,
    searchSampleCount: result.searchSampleCount,
  }
})
