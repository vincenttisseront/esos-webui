import { listUsers, countAdmins } from '../../../db/repositories/user.repository'

/**
 * GET /api/admin/users
 * Retourne la liste des comptes avec les flags `isCurrentUser` et `isLastAdmin`.
 * Accès : admin uniquement (RBAC dans auth.ts).
 */
export default defineEventHandler(async (event) => {
  const currentUserId = event.context.user!.id
  const adminCount    = await countAdmins()
  const users         = await listUsers()

  return users.map((u) => ({
    ...u,
    isCurrentUser: u.id === currentUserId,
    isLastAdmin:   u.role === 'admin' && u.active && adminCount <= 1,
  }))
})
