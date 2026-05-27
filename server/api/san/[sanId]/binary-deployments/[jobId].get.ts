import { getJobTargetForSan } from '~~/server/db/repositories/deployment.repository'
import { getDeploymentBinaryById } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler((event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const jobId = getRouterParam(event, 'jobId')!
  const match = getJobTargetForSan(jobId, sanId)
  if (!match) {
    throw createError({ statusCode: 404, message: 'Déploiement introuvable pour ce SAN' })
  }
  const binary = getDeploymentBinaryById(match.job.binaryId)
  return {
    job: match.job,
    target: match.target,
    binary,
    logs: match.target.logs,
  }
})
