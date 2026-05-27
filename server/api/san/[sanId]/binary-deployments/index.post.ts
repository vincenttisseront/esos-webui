import { sanDeployBodySchema, createSanBinaryDeployment } from '~~/server/utils/deployment-san-deploy'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body = await readBody(event)
  const parsed = sanDeployBodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Corps invalide' })
  }

  const requestedBy = event.context.user?.username ?? event.context.user?.id ?? 'unknown'
  const job = createSanBinaryDeployment(sanId, parsed.data.binaryId, requestedBy)
  return { ok: true, job }
})
