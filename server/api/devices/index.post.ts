import { createDevice } from '~/server/utils/scst-config-writer'
import { hasConfiguredSSH } from '~/server/utils/ssh-runtime'

export default defineEventHandler(async (event) => {
  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, statusMessage: 'SSH non configuré' })
  }

  const body = await readBody<{ handler: string; name: string; filename: string }>(event)
  const handler = (body?.handler ?? '').trim()
  const name = (body?.name ?? '').trim()
  const filename = (body?.filename ?? '').trim()

  if (!handler || !name) {
    throw createError({ statusCode: 400, statusMessage: 'handler et name sont requis' })
  }

  try {
    await createDevice(handler, name, filename)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    throw createError({ statusCode: 422, statusMessage: msg })
  }

  return { success: true }
})
