/**
 * Live preview of alert thresholds against current hardware / SCST state (no DB grace).
 */
import type { Overview } from '../types/esos'
import type { AlertSettings } from '../server/utils/alert-settings'
import type { FCPort, VolumeUsage } from '../server/utils/types'

export type VolumePreviewStatus = 'ok' | 'warning' | 'critical'

export type VolumePreviewRow = {
  mountpoint: string
  usedPct:    number
  status:     VolumePreviewStatus
}

export type SessionPreviewTiming = 'immediate' | 'after_grace' | 'n/a'

export type SessionPreviewRow = {
  target:    string
  group:     string
  detail:    string
  timing:    SessionPreviewTiming
  graceSec?: number
}

export type FcPortPreviewRow = {
  host:       string
  portName:   string
  portState:  string
  wouldAlert: boolean
}

export function previewVolumeStatuses(
  volumes: VolumeUsage[],
  thresholds: Pick<AlertSettings, 'volumeWarnPct' | 'volumeCriticalPct'>,
): VolumePreviewRow[] {
  return volumes.map((vol) => {
    let status: VolumePreviewStatus = 'ok'
    if (vol.usedPct >= thresholds.volumeCriticalPct) status = 'critical'
    else if (vol.usedPct >= thresholds.volumeWarnPct) status = 'warning'
    return { mountpoint: vol.mountpoint, usedPct: vol.usedPct, status }
  })
}

export function previewSessionViolations(
  overview: Overview,
  settings: Pick<
    AlertSettings,
    'sessionEnabled' | 'sessionPolicy' | 'sessionMinActive' | 'sessionGraceSec'
  >,
): SessionPreviewRow[] {
  if (!settings.sessionEnabled) return []

  const rows: SessionPreviewRow[] = []
  const timing: SessionPreviewTiming =
    settings.sessionGraceSec === 0 ? 'immediate' : 'after_grace'

  for (const target of overview.targets) {
    if (!target.enabled) continue

    const sessionsForTarget = overview.sessions.filter((s) => s.target === target.name)
    const activeInitiators  = new Set(sessionsForTarget.map((s) => s.initiatorName))

    for (const group of target.groups) {
      const configured = group.initiators
      if (configured.length === 0) continue

      const missing: string[] = []
      let activeCount = 0
      for (const ini of configured) {
        if (activeInitiators.has(ini)) activeCount++
        else missing.push(ini)
      }

      if (settings.sessionPolicy === 'multipath') {
        if (activeCount < settings.sessionMinActive) {
          rows.push({
            target: target.name,
            group:  group.name,
            detail: `active=${activeCount}, min=${settings.sessionMinActive}`,
            timing,
            graceSec: settings.sessionGraceSec,
          })
        }
      } else {
        for (const initiator of missing) {
          rows.push({
            target: target.name,
            group:  group.name,
            detail: initiator,
            timing,
            graceSec: settings.sessionGraceSec,
          })
        }
      }
    }
  }

  return rows
}

export function previewDisabledTargets(overview: Overview): string[] {
  return overview.targets.filter((t) => !t.enabled).map((t) => t.name)
}

export function previewFcPorts(
  fcPorts: FCPort[],
  fcPortEnabled: boolean,
): FcPortPreviewRow[] {
  return fcPorts.map((port) => ({
    host:       port.host,
    portName:   port.portName,
    portState:  port.portState,
    wouldAlert: fcPortEnabled && port.portState !== 'Online',
  }))
}

export function formToAlertSettingsPreview(
  form: Pick<
    AlertThresholdFormFields,
    | 'volumeWarnPct'
    | 'volumeCriticalPct'
    | 'sessionEnabled'
    | 'sessionPolicy'
    | 'sessionGraceSec'
    | 'sessionMinActive'
    | 'fcPortEnabled'
  >,
): AlertSettings {
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

type AlertThresholdFormFields = {
  volumeWarnPct:     number
  volumeCriticalPct: number
  sessionEnabled:    boolean
  sessionPolicy:     AlertSettings['sessionPolicy']
  sessionGraceSec:   number
  sessionMinActive:  number
  fcPortEnabled:     boolean
}
