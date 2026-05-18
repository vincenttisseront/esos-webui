import { z } from 'zod'
import {
  getUserById,
  updateUser,
  countAdmins,
  invalidateSessions,
} from '../../../db/repositories/user.repository'

const schema = z.object({
  displayName: z.string().max(128).nullable().optional(),
  role:        z.enum(['admin', 'operator', 'viewer']).optional(),
  active:      z.boolean().optional(),
})

/**
 * PATCH /api/admin/users/:id
 * Modifie displayName, role ou active d'un compte.
 * Accès : admin uniquement.
 *
 * Protections :
 *  - Impossible de rétrograder / désactiver le dernier admin actif.
 *  - Un admin ne peut pas se rétrograder lui-même.
 */
export default defineEventHandler(async (event) => {
  const id     = getRouterParam(event, 'id')!
  const body   = await readBody(event)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Données invalides' })
  }

  const input       = parsed.data
  const currentUser = event.context.user!
  const target      = await getUserById(id)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  // Empêcher de modifier son propre rôle ou de se désactiver soi-même
  if (target.id === currentUser.id && (input.role !== undefined || input.active === false)) {
    throw createError({ statusCode: 400, message: "Impossible de modifier votre propre rôle ou de désactiver votre propre compte." })
  }

  // Protéger le dernier admin actif
  if (target.role === 'admin' && target.active) {
    const adminCount = await countAdmins()
    if (adminCount <= 1 && (input.role !== 'admin' || input.active === false)) {
      throw createError({ statusCode: 400, message: 'Impossible : il doit rester au moins un administrateur actif.' })
    }
  }

  await updateUser(id, input)

  // Si rôle ou active changent, invalider les sessions
  if (input.role !== undefined || input.active !== undefined) {
    await invalidateSessions(id)
  }

  return { message: 'Utilisateur mis à jour.' }
})
