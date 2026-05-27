import type { HistoryEmptyReason } from '~/server/utils/history-metrics'

export interface HistoryMetaResponse {
  sanId: string
  window: string
  from: number
  to: number
  collector: {
    enabled: boolean
    intervalSec: number
    retentionHours: number
    lastRunAt: number | null
    lastError: string | null
    lastSamplesWritten: number
  }
  samples: {
    totalCount: number
    rangeCount: number
    oldestAt: number | null
    newestAt: number | null
    rangeOldestAt: number | null
    rangeNewestAt: number | null
  }
  emptyReason: HistoryEmptyReason | null
}

export function useMetricsHistoryScope() {
  const { effective, isAll } = useSelectedSan()
  const sanId = computed(() => effective.value?.id ?? null)

  const scopeReady = computed(() => !!sanId.value && !isAll.value)

  function historyParams(extra: Record<string, string> = {}) {
    if (!sanId.value) return null
    return { sanId: sanId.value, ...extra }
  }

  return { sanId, scopeReady, isAll, historyParams }
}
