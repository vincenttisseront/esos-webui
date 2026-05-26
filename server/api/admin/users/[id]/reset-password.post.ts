import { z } from 'zod'
import { getUserById, resetPassword, invalidateSessions } from '../../../../db/repositories/user.repository'

const schema = z.object({
  forcePasswordChange: z.boolean().default(true),
})

/**
 * POST /api/admin/users/:id/reset-password
 * Génère un nouveau mot de passe aléatoire et le retourne en clair une
 * seule fois. Invalide toutes les sessions actives du compte.
 * Accès : admin uniquement.
 */
export default defineEventHandler(async (event) => {
  const id     = getRouterParam(event, 'id')!
  const body   = await readBody(event).catch(() => ({}))
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Données invalides' })
  }

  const target = await getUserById(id)
  if (!target) {
    throw createError({ statusCode: 404, message: 'Utilisateur introuvable' })
  }

  const authSource = target.authSource ?? 'local'
  if (authSource !== 'local') {
    throw createError({
      statusCode: 400,
      message:    'Mot de passe géré par le fournisseur externe',
      data:       { code: 'admin.password_external_provider' },
    })
  }

  const newPassword = await resetPassword(id, parsed.data.forcePasswordChange)
  await invalidateSessions(id)

  return {
    newPassword,
    message: 'Mot de passe réinitialisé. Conservez le mot de passe affiché — il ne sera plus visible.',
  }
})
