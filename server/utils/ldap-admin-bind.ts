import { createError } from 'h3'
import { loadAuthProviderSecretsForServer } from './auth-providers-config'

/** Resolve service bind password for admin LDAP directory ops (never log). */
export async function resolveLdapBindPassword(
  override: string | undefined,
): Promise<string> {
  const trimmed = override?.trim()
  if (trimmed) return trimmed
  const { ldapBindPassword } = await loadAuthProviderSecretsForServer()
  if (!ldapBindPassword?.trim()) {
    throw createError({
      statusCode: 400,
      message:    'Mot de passe de liaison LDAP requis (configuration ou champ de test)',
    })
  }
  return ldapBindPassword
}
