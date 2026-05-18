import { getUserById, deleteUser, countAdmins } from '../../../db/repositories/user.repository'

/**
 * DELETE /api/admin/users/:id
 * Supprime un compte.
 * Accès : admin uniquement.
 *
 * Protections :
 *  - Impossible de supprimer son propre compte.
 *  - Impossible de supprimer le dernier admin actif.
 */
export default defineEventHandler(async (event) => {
  const id          = getRouterParam(event, 'id')!
  const currentUser = event.context.user!

  if (id === currentUser.id) {
    throw createError({ statusCode: 400, message: 'Impossible de supprimer votre propre compte.' })
  }

  const target = await getUserById(id)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  if (target.role === 'admin' && target.active) {
    const adminCount = await countAdmins()
    if (adminCount <= 1) {
      throw createError({ statusCode: 400, message: 'Impossible : il doit rester au moins un administrateur actif.' })
    }
  }

  await deleteUser(id)
  return { message: 'Utilisateur supprimé.' }
})
