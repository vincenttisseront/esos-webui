import { getSSHPool } from '../../../../utils/ssh-pool'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'id')!
  const pool  = getSSHPool()

  await pool.remove(sanId)
  await pool.getOrCreate(sanId)

  return { ok: true }
})
