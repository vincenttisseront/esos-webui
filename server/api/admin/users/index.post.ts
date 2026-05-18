import { z } from 'zod'
import { getUserByUsername, createUser } from '../../../db/repositories/user.repository'
import type { UserRole } from '../../../utils/types'

const schema = z.object({
  username:            z.string().min(1).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  displayName:         z.string().max(128).optional(),
  role:                z.enum(['admin', 'operator', 'viewer']),
  password:            z.string().min(8).max(128).optional(),
  forcePasswordChange: z.boolean().default(true),
})

/**
 * POST /api/admin/users
 * Crée un compte. Si `password` est omis, un mot de passe est généré et
 * renvoyé en clair une seule fois dans la réponse.
 * Accès : admin uniquement.
 */
export default defineEventHandler(async (event) => {
  const body   = await readBody(event)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Données invalides' })
  }

  const input = parsed.data

  const existing = await getUserByUsername(input.username)
  if (existing) {
    throw createError({ statusCode: 409, message: `Le nom d'utilisateur "${input.username}" est déjà utilisé.` })
  }

  const { id, generatedPassword } = await createUser(
    {
      username:            input.username,
      displayName:         input.displayName,
      role:                input.role as UserRole,
      password:            input.password,
      forcePasswordChange: input.forcePasswordChange,
    },
    event.context.user!.id,
  )

  return {
    id,
    generatedPassword,
    message: generatedPassword
      ? 'Utilisateur créé. Conservez le mot de passe affiché — il ne sera plus visible.'
      : 'Utilisateur créé.',
  }
})
