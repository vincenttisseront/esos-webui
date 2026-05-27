import { getDeploymentJobById } from '~~/server/db/repositories/deployment.repository'
import { retryFailedTargets, startDeploymentJobAsync } from '~~/server/utils/deployment-job-runner'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const job = getDeploymentJobById(id)
  if (!job) throw createError({ statusCode: 404, message: 'Job introuvable' })

  const failed = job.targets.filter(t => t.status === 'failed')
  if (!failed.length) {
    throw createError({ statusCode: 400, message: 'Aucune cible en échec à relancer' })
  }

  void retryFailedTargets(id)
  return { ok: true, jobId: id }
})
