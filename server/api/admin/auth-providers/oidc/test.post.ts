import { buildAdminAuthProvidersDto, loadAuthProviderSecretsForServer } from '../../../../utils/auth-providers-config'
import { getOidcConfigurationCached, clearOidcDiscoveryCache } from '../../../../utils/oidc-discovery'

export default defineEventHandler(async () => {
  const dto = await buildAdminAuthProvidersDto()
  if (!dto.oidc.issuer?.trim() || !dto.oidc.clientId?.trim()) {
    throw createError({ statusCode: 400, message: 'issuer et client_id OIDC requis pour le test' })
  }
  const { oidcClientSecret } = await loadAuthProviderSecretsForServer()
  clearOidcDiscoveryCache()
  try {
    const cfg = await getOidcConfigurationCached(
      dto.oidc.issuer.trim(),
      dto.oidc.clientId.trim(),
      oidcClientSecret,
    )
    const sm = cfg.serverMetadata() as Record<string, unknown> | undefined
    return {
      ok:                     true,
      authorizationEndpoint:  typeof sm?.authorization_endpoint === 'string',
      tokenEndpoint:          typeof sm?.token_endpoint === 'string',
      jwksUri:                typeof sm?.jwks_uri === 'string',
    }
  } catch (e) {
    return {
      ok:    false,
      error: (e as Error).message || 'discovery échoué',
    }
  }
})
