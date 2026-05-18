import { deleteDevice } from '~/server/utils/scst-config-writer'
import { hasConfiguredSSH } from '~/server/utils/ssh-runtime'

export default defineEventHandler(async (event) => {
  if (!(await hasConfiguredSSH())) {
    throw createError({ statusCode: 503, statusMessage: 'SSH non configuré' })
  }

  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name requis' })
  }

  try {
    await deleteDevice(name)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue'
    throw createError({ statusCode: 422, statusMessage: msg })
  }

  return { success: true }
})
