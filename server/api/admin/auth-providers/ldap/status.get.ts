import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { evaluateLdapAvailability } from '../../../../utils/auth-providers-public'
import {
  countActiveUsersByAuthSource,
  countLdapUsersByIssuer,
} from '../../../../db/repositories/user.repository'

export default defineEventHandler(async () => {
  const dto    = await buildAdminAuthProvidersDto()
  const issuer = dto.ldap.url?.trim() ?? ''
  const [ldapActive, ldapTotal] = issuer
    ? await Promise.all([
        countActiveUsersByAuthSource('ldap'),
        countLdapUsersByIssuer(issuer),
      ])
    : [dto.summary.counts.ldap, 0]

  const login = evaluateLdapAvailability(dto, dto.summary.counts)

  return {
    ldap: {
      enabled:            dto.ldap.enabled,
      url:                dto.ldap.url,
      baseDn:             dto.ldap.baseDn,
      userFilterTemplate: dto.ldap.userSearchFilter,
      loginAttr:          dto.ldap.usernameAttribute,
      displayAttr:        dto.ldap.displayNameAttribute,
      groupAttr:          dto.ldap.groupAttribute,
      bindPasswordSet:    dto.ldap.bindPasswordSet,
    },
    connectionOk: null,
    jitEnabled:   dto.auth.jitEnabled,
    login,
    provisionedCounts: {
      ldapActive,
      ldapTotal,
    },
  }
})
