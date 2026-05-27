import { getSSHPool } from '~~/server/utils/ssh-pool'
import { readMissingToolsReadiness } from '~~/server/utils/raid-missing-tools'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const pool = getSSHPool()
  const manager = pool.get(sanId)
  if (!manager) {
    return { status: 'unavailable', error: { code: 'SSH_DOWN', message: 'SSH non connecté' } }
  }
  return await readMissingToolsReadiness(manager, sanId)
})

