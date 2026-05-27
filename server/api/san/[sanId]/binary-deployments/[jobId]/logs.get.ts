import { getJobTargetForSan } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler((event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const jobId = getRouterParam(event, 'jobId')!
  const match = getJobTargetForSan(jobId, sanId)
  if (!match) {
    throw createError({ statusCode: 404, message: 'Déploiement introuvable pour ce SAN' })
  }
  return {
    jobId,
    sanId,
    logs: match.target.logs,
    status: match.target.status,
    errorMessage: match.target.errorMessage,
  }
})
