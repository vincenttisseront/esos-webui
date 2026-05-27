import { z } from 'zod'
import { assertSanWritable } from '~~/server/utils/san-request-context'
import { getDeploymentBinaryById, createDeploymentJob } from '~~/server/db/repositories/deployment.repository'
import { startDeploymentJobAsync } from '~~/server/utils/deployment-job-runner'
import { getSanSummary } from '~~/server/db/repositories/san.repository'

const bodySchema = z.object({
  binaryId: z.string().min(1),
  sanIds: z.array(z.string().min(1)).min(1).max(10),
  confirmPhrase: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Corps invalide' })
  }

  const { binaryId, sanIds } = parsed.data
  const binary = getDeploymentBinaryById(binaryId)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })

  for (const sanId of sanIds) {
    const san = getSanSummary(sanId)
    if (!san) throw createError({ statusCode: 400, message: `SAN inconnu: ${sanId}` })
    assertSanWritable(sanId)
  }

  const requestedBy = event.context.user?.username ?? event.context.user?.id ?? 'unknown'

  const job = createDeploymentJob({ binaryId, requestedBy, sanIds })
  startDeploymentJobAsync(job.id)
  return { ok: true, job }
})
