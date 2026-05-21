import { readTargetDetail } from '~/server/utils/scst-config-reader'
import { handleSSHError } from '~/server/utils/ssh-error-handler'
import { discoveredInitiatorsForTarget } from '~/utils/scst-discovered-initiators'
import { decodeTargetParam } from '~/server/utils/scst-api-helpers'

export default defineEventHandler(async (event) => {
  const targetName = decodeTargetParam(event)

  try {
    const target = await readTargetDetail(targetName)
    if (!target) {
      throw createError({ statusCode: 404, message: `Target '${targetName}' introuvable` })
    }
    return { initiators: discoveredInitiatorsForTarget(target) }
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    handleSSHError(err)
  }
})
