import { getSSHPool } from '../../../utils/ssh-pool'

export default defineEventHandler(() => {
  return getSSHPool().getAllStatuses()
})
