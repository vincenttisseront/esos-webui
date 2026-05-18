import type { AuthMfaMode } from './auth-providers-role-map'

const MFA_AMR_HINTS = new Set([
  'mfa',
  'otp',
  'hwk',
  'sms',
  'tel',
  'face',
  'fpt',
  'swk',
])

/** Sous-chaînes `acr` considérées comme indicateur MFA (plus strict que tout acr non vide). */
const MFA_ACR_SUBSTRINGS = [
  'mfa',
  'multipleauthn',
  'multifactor',
  'aal2',
  'aal3',
  'stepup',
  'http://schemas.microsoft.com/claims/multipleauthn',
]

function amrStrings(claims: Record<string, unknown>): string[] {
  const amr = claims.amr
  if (Array.isArray(amr)) {
    return amr.filter((x): x is string => typeof x === 'string').map((s) => s.toLowerCase())
  }
  if (typeof amr === 'string') return [amr.toLowerCase()]
  return []
}

function hasAmrMfaHint(claims: Record<string, unknown>): boolean {
  return amrStrings(claims).some((s) => MFA_AMR_HINTS.has(s))
}

function hasAcrMfaHint(claims: Record<string, unknown>): boolean {
  const acr = claims.acr
  if (typeof acr !== 'string') return false
  const a = acr.trim().toLowerCase()
  if (a === '' || a === '0') return false
  return MFA_ACR_SUBSTRINGS.some((h) => a.includes(h))
}

/** Indicateurs MFA côté IdP (amr / acr) — utilisé pour idp_required et pour documenter idp_preferred. */
export function hasIdpMfaIndicators(claims: Record<string, unknown>): boolean {
  return hasAmrMfaHint(claims) || hasAcrMfaHint(claims)
}

/**
 * OIDC Phase-1 MFA policy: rely on IdP claims (`amr`, `acr`).
 * Does not log token contents.
 *
 * - `off` : aucune exigence.
 * - `idp_preferred` : **non bloquant** — connexion autorisée même sans MFA dans le jeton
 *   (comportement volontairement identique à « off » côté refus ; diffère par la sémantique produit).
 * - `idp_required` : refuse si ni `amr` ni `acr` ne portent un indicateur MFA reconnu.
 */
export function idTokenSatisfiesMfaPolicy(
  claims: Record<string, unknown>,
  mode: AuthMfaMode,
): { ok: true } | { ok: false; reason: string } {
  if (mode === 'off' || mode === 'idp_preferred') return { ok: true }

  if (hasIdpMfaIndicators(claims)) return { ok: true }

  return { ok: false, reason: 'MFA requise : jeton sans indicateur MFA (amr/acr).' }
}
