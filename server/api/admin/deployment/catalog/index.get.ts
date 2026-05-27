import { listDeploymentBinaries } from '~~/server/db/repositories/deployment.repository'

export default defineEventHandler(() => {
  return { binaries: listDeploymentBinaries() }
})
