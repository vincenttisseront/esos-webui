import * as oidc from 'openid-client'
import { randomUUID } from 'node:crypto'
import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from '../../../utils/auth-providers-config'
import { isOidcLoginAvailable } from '../../../utils/auth-providers-public'
import { countActiveUsersByAuthSource } from '../../../db/repositories/user.repository'
import { encrypt } from '../../../utils/crypto'
import { hashAuthOpaqueToken } from '../../../utils/auth-state-hash'
import { insertOidcAttempt } from '../../../db/repositories/oidc-auth-attempt.repository'
import { buildOidcRedirectUri } from '../../../utils/auth-trusted-origin'
import { getOidcConfigurationCached } from '../../../utils/oidc-discovery'

export default defineEventHandler(async (event) => {
  const dto = await buildAdminAuthProvidersDto()
  const [ldapCount, oidcCount] = await Promise.all([
    countActiveUsersByAuthSource('ldap'),
    countActiveUsersByAuthSource('oidc'),
  ])
  if (!isOidcLoginAvailable(dto, { ldap: ldapCount, oidc: oidcCount })) {
    throw createError({ statusCode: 404, message: 'Connexion OIDC non disponible' })
  }

  const state    = oidc.randomState()
  const nonce    = oidc.randomNonce()
  const verifier = oidc.randomPKCECodeVerifier()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)

  const redirectUri = buildOidcRedirectUri(event, dto.oidc.redirectPath)
  const { oidcClientSecret } = await loadAuthProviderSecretsForServer()
  const cfg = await getOidcConfigurationCached(
    dto.oidc.issuer.trim(),
    dto.oidc.clientId.trim(),
    oidcClientSecret,
    redirectUri,
  )

  insertOidcAttempt({
    id:                    randomUUID(),
    stateHash:             hashAuthOpaqueToken(state),
    nonceHash:             hashAuthOpaqueToken(nonce),
    codeVerifierEncrypted: encrypt(verifier),
    nonceEncrypted:        encrypt(nonce),
  })

  const url = oidc.buildAuthorizationUrl(cfg, {
    redirect_uri:          redirectUri,
    scope:                 dto.oidc.scopes,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    response_type:         'code',
  })

  return sendRedirect(event, url.toString(), 302)
})
