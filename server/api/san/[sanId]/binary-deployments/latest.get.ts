import { getLatestDeploymentForSan } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler((event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const latest = getLatestDeploymentForSan(sanId)
  return { latest }
})
