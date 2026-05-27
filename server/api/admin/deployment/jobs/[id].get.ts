import { getDeploymentJobById } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const job = getDeploymentJobById(id)
  if (!job) throw createError({ statusCode: 404, message: 'Job introuvable' })
  return { job }
})
