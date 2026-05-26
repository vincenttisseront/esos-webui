/**
 * Snapshot helpers for alert-thresholds dirty detection (Vitest-safe).
 */
import type { AlertThresholdForm } from './alert-thresholds-validation'

export type AlertThresholdSnapshot = AlertThresholdForm

export function snapshotFromAlertThresholds(form: AlertThresholdForm): AlertThresholdSnapshot {
  return {
    volumeWarnPct:     form.volumeWarnPct,
    volumeCriticalPct: form.volumeCriticalPct,
    sessionEnabled:    form.sessionEnabled,
    sessionPolicy:     form.sessionPolicy,
    sessionGraceSec:   form.sessionGraceSec,
    sessionMinActive:  form.sessionMinActive,
    fcPortEnabled:     form.fcPortEnabled,
  }
}

export function alertThresholdSnapshotsEqual(
  a: AlertThresholdSnapshot,
  b: AlertThresholdSnapshot,
): boolean {
  return (
    a.volumeWarnPct === b.volumeWarnPct
    && a.volumeCriticalPct === b.volumeCriticalPct
    && a.sessionEnabled === b.sessionEnabled
    && a.sessionPolicy === b.sessionPolicy
    && a.sessionGraceSec === b.sessionGraceSec
    && a.sessionMinActive === b.sessionMinActive
    && a.fcPortEnabled === b.fcPortEnabled
  )
}
