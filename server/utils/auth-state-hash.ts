import { createHash } from 'node:crypto'

/**
 * Pepper for hashing OIDC state/nonce before DB storage (never log plaintext state).
 */
function pepper(): string {
  const p = process.env.NUXT_OIDC_STATE_PEPPER ?? process.env.NUXT_JWT_SECRET
  if (p && p.length >= 16) return p
  if (process.env.VITEST === 'true') {
    return 'vitest-oidc-pepper-not-for-production-32'
  }
  throw new Error(
    'NUXT_OIDC_STATE_PEPPER ou NUXT_JWT_SECRET requis pour OIDC (min 16 caractères).',
  )
}

export function hashAuthOpaqueToken(plain: string): string {
  return createHash('sha256')
    .update(pepper(), 'utf8')
    .update('\x00')
    .update(plain, 'utf8')
    .digest('hex')
}
