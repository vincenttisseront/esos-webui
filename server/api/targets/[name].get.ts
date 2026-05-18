import { readTargetDetail } from '~/server/utils/scst-config-reader'
import { handleSSHError } from '~/server/utils/ssh-error-handler'
import type { Target } from '~/types/esos'

export default defineEventHandler(async (event): Promise<Target> => {
  const raw = getRouterParam(event, 'name')
  if (!raw) {
    throw createError({ statusCode: 400, statusMessage: 'Missing target name' })
  }
  const name = decodeURIComponent(raw)

  try {
    const target = await readTargetDetail(name)
    if (!target) {
      throw createError({
        statusCode: 404,
        statusMessage: `Target '${name}' not found`,
      })
    }
    return target
  } catch (err) {
    // Preserve HTTP errors raised above (e.g. 404); only normalise SSH errors.
    if (err && typeof err === 'object' && 'statusCode' in err) throw err
    handleSSHError(err)
  }
})
