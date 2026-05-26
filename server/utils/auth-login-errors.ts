/**
 * Sanitize federated login errors — no user enumeration or JIT hints to clients.
 */
import { createError } from 'h3'

const PROVISIONING_HINTS = [
  'provisionnement jit',
  'provisionnement JIT',
  'créez le compte',
  'Aucun compte correspondant',
]

const LINKAGE_HINTS = [
  'autre annuaire',
  'autre identifiant',
  'incompatible',
  'associé à un autre',
]

function messageOf(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return ''
}

/** 403 from resolve that must look like invalid credentials on the login API. */
export function isSanitizedFederatedLoginFailure(err: unknown): boolean {
  const e = err as { statusCode?: number; data?: { code?: string; safeCode?: string } }
  if (e?.data?.code === 'ldap.user_not_imported' || e?.data?.safeCode === 'user_not_imported') {
    return true
  }
  if (e?.statusCode !== 403) return false
  const msg = messageOf(err).toLowerCase()
  return (
    PROVISIONING_HINTS.some((h) => msg.includes(h.toLowerCase()))
    || LINKAGE_HINTS.some((h) => msg.includes(h.toLowerCase()))
  )
}

export function ldapLoginSafeCodeFromError(err: unknown): string | null {
  const data = (err as { data?: { safeCode?: string } })?.data
  return data?.safeCode ?? null
}

export function throwInvalidCredentials(delayMs = 500): never {
  throw createError({
    statusCode: 401,
    message:    'Identifiants incorrects',
    data:       { code: 'auth.invalid_credentials' },
  })
}

export async function delayThenThrowInvalidCredentials(delayMs = 500): Promise<never> {
  await new Promise((r) => setTimeout(r, delayMs))
  throwInvalidCredentials()
}
