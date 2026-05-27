import { listGlobalDeploymentHistory } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler(() => {
  return { jobs: listGlobalDeploymentHistory(30) }
})
