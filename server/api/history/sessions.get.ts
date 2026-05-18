import { defineEventHandler, getQuery } from 'h3'
import { getSubjects, getTimeSeries } from '../../db/repositories/metrics.repository'

const WINDOWS: Record<string, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

export default defineEventHandler(async (event) => {
  const query      = getQuery(event)
  const windowKey  = (query.window  as string) ?? '1h'
  const metricName = (query.metric  as string) ?? 'read_kbps'
  const sanId      = (query.sanId   as string) ?? 'default'

  const windowMs = WINDOWS[windowKey] ?? WINDOWS['1h']
  const now      = Date.now()
  const from     = now - windowMs

  const subjects = await getSubjects(sanId, 'session', from, now)

  const series = await Promise.all(
    subjects.map(async (subject) => {
      const points = await getTimeSeries({ sanId, category: 'session', subject, metricName, from, to: now })
      return { subject, points }
    }),
  )

  return { window: windowKey, metric: metricName, series, from, to: now }
})
