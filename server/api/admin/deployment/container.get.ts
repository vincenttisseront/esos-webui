import { scanContainerBinariesDir } from '~~/server/utils/deployment-binaries-scan'
import { getDeploymentConfig } from '~~/server/utils/deployment-config'

export default defineEventHandler(async () => {
  const { binariesDir } = getDeploymentConfig()
  const files = await scanContainerBinariesDir()
  return { binariesDir, files }
})
