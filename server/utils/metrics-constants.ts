/** Shared time windows for history APIs (ms). */
export const METRICS_HISTORY_WINDOWS: Record<string, number> = {
  '1h':  60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
}

export const METRICS_SESSION_DRIVERS = ['qla2x00t', 'iscsi'] as const

/** Canonical SAN id for v1 / env SSH when no active SAN row exists. */
export function defaultMetricsSanId(): string {
  return process.env.DEFAULT_SAN_ID ?? 'default'
}

/** Volume `subject` in metric_samples (matches collector). */
export function mountpointToVolumeSubject(mountpoint: string): string {
  return mountpoint.trim().replace(/\//g, '_').replace(/^_/, '') || 'root'
}

export function resolveHistoryWindowMs(windowKey: string): number {
  return METRICS_HISTORY_WINDOWS[windowKey] ?? METRICS_HISTORY_WINDOWS['1h']
}
