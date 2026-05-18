import { getLoginHistory } from '../../db/repositories/user.repository'

export default defineEventHandler(async (event) => {
  const userId = event.context.user!.id
  return getLoginHistory(20, userId)
})
