import { getDeploymentConfig } from '~~/server/utils/deployment-config'
import { listContainerWithRegistration } from '~~/server/utils/deployment-binaries-service'

export default defineEventHandler(async () => {
  const { binariesDir } = getDeploymentConfig()
  const files = await listContainerWithRegistration()
  return { binariesDir, files }
})
