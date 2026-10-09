/**
 * Docker / runtime env overrides for auth providers (no Admin UI required).
 * Used when Bastion fronts ESOS and settings must ship in the image.
 */

export function envFlagTrue(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

export function envFlagFalse(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'no' || v === 'off'
}

/** Bastion header SSO — AUTH_HEADER_ENABLED overrides DB. */
export function resolveHeaderAuthEnabled(dbEnabled: boolean): boolean {
  if (envFlagTrue('AUTH_HEADER_ENABLED')) return true
  if (envFlagFalse('AUTH_HEADER_ENABLED')) return false
  return dbEnabled
}

/** When true, shared token is not required (private proxy peer still checked). */
export function resolveHeaderTrustWithoutToken(dbRequireToken: boolean): boolean {
  if (envFlagTrue('AUTH_HEADER_TRUST_WITHOUT_TOKEN')) return true
  if (envFlagFalse('AUTH_HEADER_TRUST_WITHOUT_TOKEN')) return false
  return dbRequireToken === false
}

export function resolveJitEnabled(dbEnabled: boolean): boolean {
  if (envFlagTrue('AUTH_JIT_ENABLED')) return true
  if (envFlagFalse('AUTH_JIT_ENABLED')) return false
  return dbEnabled
}

export function resolveHeaderUserHeader(dbValue: string | undefined): string {
  const fromEnv = process.env.AUTH_HEADER_USER_HEADER?.trim()
  if (fromEnv) return fromEnv
  return dbValue?.trim() || 'X-Remote-User'
}

export function resolveHeaderIssuer(dbValue: string | undefined): string {
  const fromEnv = process.env.AUTH_HEADER_ISSUER?.trim()
  if (fromEnv) return fromEnv
  return dbValue?.trim() || 'bastion-pro'
}
