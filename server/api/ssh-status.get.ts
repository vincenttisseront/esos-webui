import { getRuntimeSSHState } from '~/server/utils/ssh-runtime'

export default defineEventHandler(() => {
  return getRuntimeSSHState()
})
