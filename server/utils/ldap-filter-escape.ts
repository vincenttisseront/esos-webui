import { createError } from 'h3'

/**
 * Escape a value for use inside an LDAP filter substring (RFC 4515).
 */
export function escapeLdapFilterValue(input: string): string {
  return input
    .replace(/\\/g, '\\5c')
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00')
}

export function assertSafeLdapLoginUsername(username: string): void {
  if (username.length < 1 || username.length > 256) {
    throw createError({ statusCode: 400, message: 'Identifiant LDAP invalide' })
  }
  if (/[*()\0]/.test(username)) {
    throw createError({ statusCode: 400, message: 'Caractères non autorisés dans l’identifiant' })
  }
}

/** Directory browse query (substring search). */
export function assertSafeLdapSearchQuery(query: string): void {
  const q = query.trim()
  if (q.length < 2 || q.length > 64) {
    throw createError({ statusCode: 400, message: 'La recherche doit contenir entre 2 et 64 caractères' })
  }
  if (/[*()\0]/.test(q)) {
    throw createError({ statusCode: 400, message: 'Caractères non autorisés dans la recherche' })
  }
}
