import { defineEventHandler, getQuery } from 'h3'
import { getTimeSeries } from '../../db/repositories/metrics.repository'

const WINDOWS: Record<string, number> = {
  '1h':  3_600_000,
  '6h':  21_600_000,
  '24h': 86_400_000,
}

export default defineEventHandler(async (event) => {
  const query     = getQuery(event)
  const windowKey = (query.window as string) ?? '1h'
  const sanId     = (query.sanId  as string) ?? 'default'
  const windowMs  = WINDOWS[windowKey] ?? WINDOWS['1h']
  const now       = Date.now()
  const from      = now - windowMs

  const [cpu, load1m, ram, volume] = await Promise.all([
    getTimeSeries({ sanId, category: 'system', subject: 'cpu',              metricName: 'cpu_pct',  from, to: now }),
    getTimeSeries({ sanId, category: 'system', subject: 'cpu',              metricName: 'load_1m',  from, to: now }),
    getTimeSeries({ sanId, category: 'memory', subject: 'ram',              metricName: 'used_pct', from, to: now }),
    getTimeSeries({ sanId, category: 'volume', subject: 'mnt_vdisks_fs01', metricName: 'used_pct', from, to: now }),
  ])

  return { window: windowKey, from, to: now, series: { cpu, load1m, ram, volume } }
})
