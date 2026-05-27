import { getBinariesStorageStatus } from '~~/server/utils/deployment-binaries-storage'

export default defineEventHandler(async () => {
  const status = await getBinariesStorageStatus()
  return { ok: true, status }
})
