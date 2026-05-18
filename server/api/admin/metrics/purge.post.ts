import { getDB } from '../../../db'
import { metricSamples } from '../../../db/schema'

export default defineEventHandler(async () => {
  const db     = getDB()
  const result = await db.delete(metricSamples)
  return { ok: true, deleted: (result as any).changes ?? 0 }
})
