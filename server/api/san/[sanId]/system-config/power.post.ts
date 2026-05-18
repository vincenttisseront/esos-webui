import { z } from 'zod'
import { runCommand } from '~~/server/utils/config-writer'
import { getUserById } from '~~/server/db/repositories/user.repository'
import { verifyPassword } from '~~/server/utils/password'

const bodySchema = z.object({
  action:   z.enum(['reboot', 'poweroff']),
  password: z.string().min(1, 'Mot de passe requis'),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const { action, password } = parsed.data

  // Verify caller's password against the WebUI account (middleware: context.user.id)
  const userId = event.context.user?.id
  if (!userId) throw createError({ statusCode: 401, message: 'Non authentifié' })

  const user = await getUserById(userId)
  if (!user) throw createError({ statusCode: 401, message: 'Utilisateur introuvable' })

  const valid = await verifyPassword(user.passwordHash, password)
  if (!valid) throw createError({ statusCode: 403, message: 'Mot de passe incorrect' })

  const cmd = action === 'reboot' ? 'reboot' : 'poweroff'

  // Fire-and-forget — the SSH connection will close as part of the shutdown
  await runCommand(sanId, cmd, false, 5_000)

  return { ok: true }
})
