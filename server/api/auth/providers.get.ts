import { buildAdminAuthProvidersDto } from '../../utils/auth-providers-config'

export default defineEventHandler(async () => {
  const dto = await buildAdminAuthProvidersDto()
  return {
    local: true,
    ldap:  dto.ldap.enabled,
    oidc:  dto.oidc.enabled,
  }
})
