import { createError, getQuery, type H3Event } from 'h3'
import { getSampleStats } from '../db/repositories/metrics.repository'
import { getCollectorConfig } from './collector-config'
import { getCollectorRunStatus } from './collector-status'
import { defaultMetricsSanId, resolveHistoryWindowMs } from './metrics-constants'
import { getActiveSans, parseOptionalSanIdQuery } from './san-request-context'

const MULTI_SAN_MESSAGE = 'sanId is required when multiple SANs are configured'

export type HistoryEmptyReason =
  | 'collector_disabled'
  | 'collector_not_running'
  | 'no_samples_yet'
  | 'range_empty'
  | 'ssh_unavailable'

export interface HistoryQueryScope {
  sanId: string
  windowKey: string
  from: number
  to: number
}

export function resolveHistorySanId(event: H3Event): string {
  const explicit = parseOptionalSanIdQuery(event)
  if (explicit) return explicit
  const active = getActiveSans()
  if (active.length > 1) {
    throw createError({ statusCode: 400, statusMessage: MULTI_SAN_MESSAGE })
  }
  if (active.length === 1) return active[0].id
  return defaultMetricsSanId()
}

export function parseHistoryQuery(event: H3Event): HistoryQueryScope {
  const query = getQuery(event) as { window?: string }
  const windowKey = (query.window as string) ?? '1h'
  const to = Date.now()
  const from = to - resolveHistoryWindowMs(windowKey)
  const sanId = resolveHistorySanId(event)
  return { sanId, windowKey, from, to }
}

export async function buildHistoryMeta(scope: HistoryQueryScope) {
  const [collectorCfg, statsAll, statsRange] = await Promise.all([
    getCollectorConfig(),
    getSampleStats(scope.sanId),
    getSampleStats(scope.sanId, scope.from, scope.to),
  ])
  const run = getCollectorRunStatus()

  let emptyReason: HistoryEmptyReason | null = null
  if (!collectorCfg.enabled) {
    emptyReason = 'collector_disabled'
  } else if (statsAll.totalCount === 0) {
    if (!run.lastRunAt) emptyReason = 'collector_not_running'
    else if (run.lastError) emptyReason = 'ssh_unavailable'
    else emptyReason = 'no_samples_yet'
  } else if (statsRange.rangeCount === 0) {
    emptyReason = 'range_empty'
  }

  return {
    sanId: scope.sanId,
    window: scope.windowKey,
    from: scope.from,
    to: scope.to,
    collector: {
      enabled: collectorCfg.enabled,
      intervalSec: collectorCfg.intervalSec,
      retentionHours: collectorCfg.retentionHours,
      lastRunAt: run.lastRunAt,
      lastError: run.lastError,
      lastSamplesWritten: run.lastSamplesWritten,
    },
    samples: {
      totalCount: statsAll.totalCount,
      rangeCount: statsRange.rangeCount,
      oldestAt: statsAll.oldestAt,
      newestAt: statsAll.newestAt,
      rangeOldestAt: statsRange.oldestAt,
      rangeNewestAt: statsRange.newestAt,
    },
    emptyReason,
  }
}
