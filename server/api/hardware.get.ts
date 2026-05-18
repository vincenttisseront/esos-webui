import { defineEventHandler, createError } from 'h3'
import { getActiveSSHManager, hasConfiguredSSH } from '../utils/ssh-runtime'
import { readHardwareOverview } from '../utils/hardware-reader'
import { runReadWithSanScope } from '../utils/san-request-context'
import { createEmptyHardwareOverview } from '../utils/types'

export default defineEventHandler(async (event) => {
  if (!hasConfiguredSSH()) {
    return createEmptyHardwareOverview()
  }

  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH not connected' })
    }
    return readHardwareOverview()
  }

  try {
    return await runReadWithSanScope(event, run)
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    throw createError({
      statusCode: status ?? 500,
      statusMessage: err instanceof Error ? err.message : 'Hardware read error',
    })
  }
})
