import { buildAdminAuthProvidersDto } from '../../../../utils/auth-providers-config'
import { parseUserRole } from '../../../../utils/auth-providers-role-map'
import { provisionLdapUsers, type ProvisionLdapUserInput } from '../../../../utils/ldap-provision'
import type { UserRole } from '../../../../utils/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    users?: Array<{
      dn:           string
      login:        string
      displayName?: string | null
      mail?:        string | null
      groups?:      string[]
      esosUsername?: string
      role:         string
      active?:      boolean
    }>
  }>(event).catch(() => ({}))

  const raw = body.users ?? []
  if (raw.length === 0) {
    throw createError({ statusCode: 400, message: 'Aucun utilisateur à importer' })
  }
  if (raw.length > 50) {
    throw createError({ statusCode: 400, message: 'Maximum 50 utilisateurs par requête' })
  }

  const users: ProvisionLdapUserInput[] = []
  for (const row of raw) {
    const role = parseUserRole(row.role, 'viewer')
    if (row.role !== role) {
      throw createError({ statusCode: 400, message: `Rôle invalide pour ${row.dn}` })
    }
    users.push({
      dn:           row.dn?.trim() ?? '',
      login:        row.login?.trim() ?? '',
      displayName:  row.displayName ?? null,
      mail:         row.mail ?? null,
      groups:       Array.isArray(row.groups) ? row.groups : [],
      esosUsername: row.esosUsername?.trim(),
      role:         role as UserRole,
      active:       row.active,
    })
  }

  const dto       = await buildAdminAuthProvidersDto()
  const createdBy = event.context.user?.id ?? null

  const { imported, updated, results } = await provisionLdapUsers(dto, users, createdBy)
  const failed = results
    .filter((r): r is Extract<typeof r, { status: 'failed' }> => r.status === 'failed')
    .map((r) => ({ dn: r.dn, code: r.code, message: r.message }))

  return { imported, updated, failed, results }
})
