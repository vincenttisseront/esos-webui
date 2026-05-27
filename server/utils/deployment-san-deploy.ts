import { z } from 'zod'
import { assertSanWritable } from './san-request-context'
import { getSanSummary } from '../db/repositories/san.repository'
import {
  createDeploymentJob,
  getDeploymentBinaryById,
  getDeploymentJobById,
  getJobTargetForSan,
} from '../db/repositories/deployment.repository'
import { startDeploymentJobAsync, retryFailedTargets } from './deployment-job-runner'

export const sanDeployBodySchema = z.object({
  binaryId: z.string().min(1),
})

export function createSanBinaryDeployment(
  sanId: string,
  binaryId: string,
  requestedBy: string,
) {
  const san = getSanSummary(sanId)
  if (!san) {
    throw createError({ statusCode: 404, message: 'SAN introuvable' })
  }
  assertSanWritable(sanId)

  const binary = getDeploymentBinaryById(binaryId)
  if (!binary) {
    throw createError({ statusCode: 404, message: 'Binaire catalogue introuvable' })
  }

  const job = createDeploymentJob({
    binaryId,
    requestedBy,
    sanIds: [sanId],
    scope: 'single_san',
  })

  startDeploymentJobAsync(job.id)
  return job
}

export async function retrySanBinaryDeployment(jobId: string, sanId: string) {
  const match = getJobTargetForSan(jobId, sanId)
  if (!match) {
    throw createError({ statusCode: 404, message: 'Déploiement introuvable pour ce SAN' })
  }
  if (match.target.status !== 'failed') {
    throw createError({ statusCode: 400, message: 'Seuls les déploiements en échec peuvent être relancés' })
  }
  assertSanWritable(sanId)
  await retryFailedTargets(jobId)
  return getDeploymentJobById(jobId)!
}
