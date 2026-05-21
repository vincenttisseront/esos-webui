import { createDevice } from '~/server/utils/scst-config-writer'
import { requireScstMutationContext } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ handler: string; name: string; filename: string }>(event)
  const handler = (body?.handler ?? '').trim()
  const name = (body?.name ?? '').trim()
  const filename = (body?.filename ?? '').trim()

  if (!handler || !name) {
    throw createError({ statusCode: 400, statusMessage: 'handler et name sont requis' })
  }

  await requireScstMutationContext(event, async () => {
    await createDevice(handler, name, filename)
  })

  return { success: true }
})
