import { deleteDevice } from '~/server/utils/scst-config-writer'
import { requireScstMutationContext } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const name = decodeURIComponent(getRouterParam(event, 'name') ?? '')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name requis' })
  }

  await requireScstMutationContext(event, async () => {
    await deleteDevice(name)
  })

  return { success: true }
})
