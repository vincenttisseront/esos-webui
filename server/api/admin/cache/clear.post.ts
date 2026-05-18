import { invalidateCache } from '../../../utils/cache'

export default defineEventHandler(() => {
  invalidateCache()
  return { ok: true }
})
