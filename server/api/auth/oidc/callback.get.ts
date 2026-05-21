import * as oidc from 'openid-client'
import { getRequestURL, getQuery, sendRedirect } from 'h3'
import { decrypt } from '../../../utils/crypto'
import { hashAuthOpaqueToken } from '../../../utils/auth-state-hash'
import { consumeOidcAttempt } from '../../../db/repositories/oidc-auth-attempt.repository'
import {
  buildAdminAuthProvidersDto,
  loadAuthProviderSecretsForServer,
} from '../../../utils/auth-providers-config'
import { buildOidcRedirectUri } from '../../../utils/auth-trusted-origin'
import { getOidcConfigurationCached } from '../../../utils/oidc-discovery'
import { idTokenSatisfiesMfaPolicy } from '../../../utils/auth-providers-mfa'
import { isSanitizedFederatedLoginFailure } from '../../../utils/auth-login-errors'
import { resolveOidcLoginUser } from '../../../utils/oidc-user-resolve'
import { setSessionCookieForUser } from '../../../utils/auth-session-cookie'

function redirectLoginError(event: Parameters<typeof sendRedirect>[0], code: string) {
  return sendRedirect(event, `/login?error=${encodeURIComponent(code)}`, 302)
}

export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  if (q.error) {
    return redirectLoginError(event, 'oidc_denied')
  }

  const state = String(q.state ?? '')
  const code  = String(q.code ?? '')
  if (!state || !code) {
    return redirectLoginError(event, 'oidc_missing')
  }

  const dto = await buildAdminAuthProvidersDto()
  if (!dto.oidc.enabled) {
    return redirectLoginError(event, 'oidc_disabled')
  }

  const attempt = consumeOidcAttempt(hashAuthOpaqueToken(state))
  if (!attempt) {
    return redirectLoginError(event, 'oidc_state')
  }

  let verifier: string
  let nonce: string
  try {
    verifier = decrypt(attempt.codeVerifierEncrypted)
    nonce    = decrypt(attempt.nonceEncrypted)
  } catch {
    return redirectLoginError(event, 'oidc_corrupt')
  }

  const redirectUri = buildOidcRedirectUri(event, dto.oidc.redirectPath)
  const { oidcClientSecret } = await loadAuthProviderSecretsForServer()
  let cfg: oidc.Configuration
  try {
    cfg = await getOidcConfigurationCached(
      dto.oidc.issuer.trim(),
      dto.oidc.clientId.trim(),
      oidcClientSecret,
      redirectUri,
    )
  } catch {
    return redirectLoginError(event, 'oidc_discovery')
  }

  const currentUrl = getRequestURL(event)

  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
  try {
    tokens = await oidc.authorizationCodeGrant(cfg, currentUrl, {
      pkceCodeVerifier: verifier,
      expectedState:    state,
      expectedNonce:    nonce,
      idTokenExpected:  true,
    })
  } catch {
    return redirectLoginError(event, 'oidc_token')
  }

  const idClaims = tokens.claims() as Record<string, unknown> | undefined
  if (!idClaims?.sub) {
    return redirectLoginError(event, 'oidc_claims')
  }

  const mfa = idTokenSatisfiesMfaPolicy(idClaims, dto.auth.mfaMode)
  if (!mfa.ok) {
    return redirectLoginError(event, 'mfa_required')
  }

  const issuer  = String(idClaims.iss ?? dto.oidc.issuer.trim())
  const subject = String(idClaims.sub)

  let user
  try {
    user = await resolveOidcLoginUser({ issuer, subject, claims: idClaims, dto })
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status === 403 || isSanitizedFederatedLoginFailure(e)) {
      return redirectLoginError(event, 'login_failed')
    }
    if (status) throw e
    return redirectLoginError(event, 'login_failed')
  }

  if (!user.active) {
    return redirectLoginError(event, 'inactive')
  }

  await setSessionCookieForUser(event, user)

  if (user.forcePasswordChange) {
    return sendRedirect(event, '/admin/change-password', 302)
  }
  return sendRedirect(event, '/', 302)
})
