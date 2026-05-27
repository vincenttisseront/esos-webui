import { createError, defineEventHandler, getQuery } from 'h3'
import { getSubjects, getTimeSeries } from '../../db/repositories/metrics.repository'
import { parseHistoryQuery } from '../../utils/history-metrics'

const DEVICE_METRICS = new Set(['read_kbps', 'write_kbps', 'read_iops', 'write_iops'])

export default defineEventHandler(async (event) => {
  const scope = parseHistoryQuery(event)
  const query = getQuery(event)
  const metricName = (query.metric as string) ?? 'read_kbps'
  if (!DEVICE_METRICS.has(metricName)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid device metric' })
  }

  const subjects = await getSubjects(scope.sanId, 'device', scope.from, scope.to)

  const series = await Promise.all(
    subjects.map(async (subject) => {
      const points = await getTimeSeries({
        sanId: scope.sanId,
        category: 'device',
        subject,
        metricName,
        from: scope.from,
        to: scope.to,
      })
      return { subject, points }
    }),
  )

  return {
    window: scope.windowKey,
    metric: metricName,
    sanId: scope.sanId,
    series,
    from: scope.from,
    to: scope.to,
  }
})
