import type { HistoryEmptyReason } from '~/server/utils/history-metrics'

export function formatMetricTimestamp(ts: number | null | undefined, locale?: string): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString(locale ?? undefined, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function historyEmptyReasonKey(reason: HistoryEmptyReason | null | undefined): string {
  if (!reason) return ''
  return `monitoring.history.empty.${reason}`
}

export function kbpsTooltipLabel(kbps: number | null, label: string): string {
  if (kbps == null) return ''
  if (kbps >= 1_048_576) return `${label}: ${(kbps / 1_048_576).toFixed(1)} GB/s`
  if (kbps >= 1_024) return `${label}: ${(kbps / 1_024).toFixed(1)} MB/s`
  return `${label}: ${kbps.toFixed(0)} KB/s`
}

/** API stores KB/s; alias as bytes/s for typed consumers. */
export function kbpsToBytesPerSec(kbps: number): number {
  return kbps * 1024
}
