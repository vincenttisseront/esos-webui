import { buildAdminAuthProvidersDto, loadAuthProviderSecretsForServer } from '../../../../utils/auth-providers-config'
import { getOidcConfigurationCached, clearOidcDiscoveryCache } from '../../../../utils/oidc-discovery'
import {
  classifyOidcDiscoveryError,
  normalizeOidcIssuer,
  oidcDiscoveryUrl,
  type OidcDiscoveryTestResult,
} from '../../../../../utils/oidc-discovery-errors'

export default defineEventHandler(async (): Promise<OidcDiscoveryTestResult> => {
  const dto = await buildAdminAuthProvidersDto()
  const issuer = normalizeOidcIssuer(dto.oidc.issuer ?? '')
  const clientId = dto.oidc.clientId?.trim() ?? ''
  if (!issuer || !clientId) {
    throw createError({ statusCode: 400, message: 'issuer et client_id OIDC requis pour le test' })
  }
  const { oidcClientSecret } = await loadAuthProviderSecretsForServer()
  clearOidcDiscoveryCache()
  try {
    const cfg = await getOidcConfigurationCached(issuer, clientId, oidcClientSecret)
    const sm = cfg.serverMetadata() as Record<string, unknown> | undefined
    return {
      ok:                    true,
      authorizationEndpoint: typeof sm?.authorization_endpoint === 'string',
      tokenEndpoint:         typeof sm?.token_endpoint === 'string',
      jwksUri:               typeof sm?.jwks_uri === 'string',
    }
  } catch (e) {
    try {
      new URL(issuer)
    } catch {
      return {
        ok:             false,
        code:           'invalid_issuer',
        error:          'Invalid issuer URL',
        expectedIssuer: issuer,
        discoveryUrl:   oidcDiscoveryUrl(issuer),
      }
    }
    return classifyOidcDiscoveryError(e, issuer)
  }
})
