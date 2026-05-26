import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { listLdapUsersByIssuer } from '../../../../db/repositories/user.repository'

export default defineEventHandler(async () => {
  const dto    = await buildAdminAuthProvidersDto()
  const issuer = dto.ldap.url?.trim()
  if (!issuer) {
    return { users: [] }
  }

  const rows = await listLdapUsersByIssuer(issuer)
  return {
    users: rows.map((u) => ({
      id:            u.id,
      username:      u.username,
      displayName:   u.displayName,
      role:          u.role,
      active:        u.active,
      externalLogin: u.externalLogin,
      externalEmail: u.externalEmail,
      dn:            u.dn,
      lastLoginAt:   u.lastLoginAt,
    })),
  }
})
