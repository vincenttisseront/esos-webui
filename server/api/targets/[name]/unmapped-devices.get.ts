import { readOverview } from '~/server/utils/scst-config-reader'
import { handleSSHError } from '~/server/utils/ssh-error-handler'
import { unmappedDevicesForTarget } from '~/utils/scst-unmapped-devices'
import { decodeTargetParam } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)

  try {
    const overview = await readOverview()
    const target = overview.targets.find(t => t.name === targetName)
      ?? overview.systemTargets.find(t => t.name === targetName)
    if (!target) {
      throw createError({ statusCode: 404, message: `Target '${targetName}' introuvable` })
    }
    return { devices: unmappedDevicesForTarget(overview, targetName) }
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    handleSSHError(err)
  }
})
