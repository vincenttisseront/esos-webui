import { createTarget } from '~/server/utils/scst-config-writer'
import { hasConfiguredSSH } from '~/server/utils/ssh-runtime'

export default defineEventHandler(async (event) => {
  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, statusMessage: 'SSH non configuré' })
  }

  const body = await readBody<{ driver: string; name: string }>(event)
  const driver = (body?.driver ?? '').trim()
  const name = (body?.name ?? '').trim()

  if (!driver || !name) {
    throw createError({ statusCode: 400, statusMessage: 'driver et name sont requis' })
  }

  try {
    await createTarget(driver, name)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    throw createError({ statusCode: 422, statusMessage: msg })
  }

  return { success: true }
})
