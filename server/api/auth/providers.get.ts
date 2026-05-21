import { buildAdminAuthProvidersDto } from '../../utils/auth-providers-config'
import { buildPublicAuthProviders } from '../../utils/auth-providers-public'
import { countActiveUsersByAuthSource } from '../../db/repositories/user.repository'

export default defineEventHandler(async () => {
  const dto = await buildAdminAuthProvidersDto()
  const [ldapCount, oidcCount] = await Promise.all([
    countActiveUsersByAuthSource('ldap'),
    countActiveUsersByAuthSource('oidc'),
  ])
  return buildPublicAuthProviders(dto, { ldap: ldapCount, oidc: oidcCount })
})
