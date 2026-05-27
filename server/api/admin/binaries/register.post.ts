import { z } from 'zod'
import { registerContainerBinary } from '~~/server/utils/deployment-binaries-service'

const bodySchema = z.object({
  filename: z.string().min(1),
  allowDuplicate: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Corps invalide' })
  }

  const binary = await registerContainerBinary(parsed.data.filename, parsed.data.allowDuplicate)
  return { ok: true, binary }
})
