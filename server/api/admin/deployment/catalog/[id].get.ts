import {
  getDeploymentBinaryById,
  listRecentJobsForBinary,
} from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const binary = getDeploymentBinaryById(id)
  if (!binary) throw createError({ statusCode: 404, message: 'Binaire introuvable' })
  return { binary, recentJobs: listRecentJobsForBinary(id) }
})
