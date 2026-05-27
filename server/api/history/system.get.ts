import { defineEventHandler } from 'h3'
import { getTimeSeries, getVolumeSubjects } from '../../db/repositories/metrics.repository'
import { parseHistoryQuery } from '../../utils/history-metrics'

export default defineEventHandler(async (event) => {
  const scope = parseHistoryQuery(event)

  const [cpu, load1m, ram, volumeSubjects] = await Promise.all([
    getTimeSeries({
      sanId: scope.sanId,
      category: 'system',
      subject: 'cpu',
      metricName: 'cpu_pct',
      from: scope.from,
      to: scope.to,
    }),
    getTimeSeries({
      sanId: scope.sanId,
      category: 'system',
      subject: 'cpu',
      metricName: 'load_1m',
      from: scope.from,
      to: scope.to,
    }),
    getTimeSeries({
      sanId: scope.sanId,
      category: 'memory',
      subject: 'ram',
      metricName: 'used_pct',
      from: scope.from,
      to: scope.to,
    }),
    getVolumeSubjects(scope.sanId, scope.from, scope.to),
  ])

  const volumeSeries = await Promise.all(
    volumeSubjects.map(async (subject) => ({
      subject,
      points: await getTimeSeries({
        sanId: scope.sanId,
        category: 'volume',
        subject,
        metricName: 'used_pct',
        from: scope.from,
        to: scope.to,
      }),
    })),
  )

  return {
    window: scope.windowKey,
    sanId: scope.sanId,
    from: scope.from,
    to: scope.to,
    series: { cpu, load1m, ram, volume: volumeSeries },
  }
})
