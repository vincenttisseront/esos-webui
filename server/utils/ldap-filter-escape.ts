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
