import type { HardwareOverview, Alert } from './types'
import type { Overview } from '../../types/esos'
import type { AlertSettings } from './alert-settings'
import { DEFAULT_ALERT_SETTINGS } from './alert-settings'
import { clearSessionGraceState, finalizeSessionGrace } from '../db/repositories/alert-session-state.repository'

/**
 * Détection des alertes passives (cf. SDD v2.3 §5).
 * Les identifiants d'alerte sont stables pour la déduplication côté UI.
 * Les alertes « session » avec grâce > 0 s'appuient sur `alert_session_state` (SQLite, par SAN).
 */

export interface DetectAlertsContext {
  settings: AlertSettings
  /** Scope SAN pour la persistance de grâce. */
  sanKey: string
}

function formatKb(kb: number): string {
  if (kb >= 1_073_741_824) return `${(kb / 1_073_741_824).toFixed(1)} TB`
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`
  if (kb >= 1_024) return `${(kb / 1_024).toFixed(1)} MB`
  return `${kb} KB`
}

function escKey(s: string): string {
  return s.replace(/\|/g, '_')
}

function buildSessionStrictDedupe(sanKey: string, targetName: string, groupName: string, initiator: string): string {
  return `session-lost|${sanKey}|${escKey(targetName)}|${escKey(groupName)}|${escKey(initiator)}`
}

function buildSessionMultipathDedupe(sanKey: string, targetName: string, groupName: string): string {
  return `session-low|${sanKey}|${escKey(targetName)}|${escKey(groupName)}`
}

interface SessionViolDetail {
  title: string
  message: string
  meta?: Alert['meta']
}

export function detectAlerts(
  hw: HardwareOverview,
  overview: Overview,
  ctx?: DetectAlertsContext,
): Alert[] {
  const settings = ctx?.settings ?? DEFAULT_ALERT_SETTINGS
  const sanKey   = ctx?.sanKey ?? '__default__'
  const now      = Date.now()

  const alerts: Alert[] = []

  if (settings.fcPortEnabled) {
    for (const port of hw.fcPorts) {
      if (port.portState !== 'Online') {
        alerts.push({
          id: `fc-port-${port.host}`,
          level: 'error',
          title: `Port FC hors ligne : ${port.host}`,
          message: `${port.portName} — état : ${port.portState}`,
          source: 'fc',
          since: now,
        })
      }
    }
  }

  for (const vol of hw.volumes) {
    if (vol.usedPct >= settings.volumeCriticalPct) {
      alerts.push({
        id: `vol-full-${vol.mountpoint.replace(/\//g, '-')}`,
        level: 'error',
        title: `Volume plein : ${vol.mountpoint}`,
        message: `${vol.usedPct}% utilisé (${formatKb(vol.availableKb)} disponibles)`,
        source: 'volume',
        since: now,
      })
    } else if (vol.usedPct >= settings.volumeWarnPct) {
      alerts.push({
        id: `vol-warn-${vol.mountpoint.replace(/\//g, '-')}`,
        level: 'warning',
        title: `Volume presque plein : ${vol.mountpoint}`,
        message: `${vol.usedPct}% utilisé (seuil avertissement ${settings.volumeWarnPct}%)`,
        source: 'volume',
        since: now,
      })
    }
  }

  const load1 = hw.system.loadAvg[0]
  if (load1 > hw.system.cpuCores * 2) {
    alerts.push({
      id: 'cpu-overload',
      level: 'warning',
      title: 'CPU surchargé',
      message: `Load average 1min : ${load1} (${hw.system.cpuCores} cores)`,
      source: 'cpu',
      since: now,
    })
  }

  if (hw.memory.usedPct >= 95) {
    alerts.push({
      id: 'memory-critical',
      level: 'error',
      title: 'Mémoire critique',
      message: `${hw.memory.usedPct}% utilisée`,
      source: 'cpu',
      since: now,
    })
  }

  for (const target of overview.targets) {
    if (!target.enabled) {
      alerts.push({
        id: `target-disabled-${target.name}`,
        level: 'warning',
        title: `Target désactivée`,
        message: `${target.name} (${target.driver}) est désactivée`,
        source: 'session',
        since: now,
      })
    }
  }

  const sessionCandidates = new Map<string, SessionViolDetail>()

  if (!settings.sessionEnabled) {
    clearSessionGraceState(sanKey)
  } else if (settings.sessionGraceSec === 0) {
    clearSessionGraceState(sanKey)
  }

  if (settings.sessionEnabled) {
    for (const target of overview.targets) {
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

        const pathCount = sessionsForTarget.filter((s) =>
          configured.includes(s.initiatorName),
        ).length

        if (settings.sessionPolicy === 'multipath') {
          if (activeCount < settings.sessionMinActive) {
            const key = buildSessionMultipathDedupe(sanKey, target.name, group.name)
            const missLabel = missing.slice(0, 8).join(', ')
            const extra     = missing.length > 8 ? '…' : ''
            const msg =
              `${target.name} — groupe « ${group.name} » : ${activeCount} initiateur(s) distinct(s) avec session ` +
              `(< seuil ${settings.sessionMinActive}). ` +
              `Sessions (chemins) vers initiateurs du groupe : ${pathCount}. ` +
              (missing.length ? `Sans session : ${missLabel}${extra}. ` : '') +
              `(politique multipathing.)`
            sessionCandidates.set(key, {
              title: 'Sessions insuffisantes (multipathing)',
              message: msg,
              meta: {
                target:               target.name,
                group:                group.name,
                activeInitiatorCount: activeCount,
                minRequired:          settings.sessionMinActive,
                pathCount,
              },
            })
          }
        } else {
          for (const initiator of missing) {
            const key = buildSessionStrictDedupe(sanKey, target.name, group.name, initiator)
            const msg =
              `${initiator} — target ${target.name}, groupe « ${group.name} » : aucune session active. ` +
              `Initiateurs actifs sur ce target : ${activeInitiators.size}. ` +
              `Sessions (chemins vers ce groupe) : ${pathCount}.`
            sessionCandidates.set(key, {
              title: 'Session perdue',
              message: msg,
              meta: {
                target:               target.name,
                group:                group.name,
                initiator,
                activeInitiatorCount: activeInitiators.size,
                pathCount,
              },
            })
          }
        }
      }
    }

    const violated = new Set(sessionCandidates.keys())

    if (settings.sessionGraceSec > 0) {
      const emitSince = finalizeSessionGrace(sanKey, violated, settings.sessionGraceSec, now)
      for (const [key, since] of emitSince) {
        const d = sessionCandidates.get(key)
        if (!d) continue
        alerts.push({
          id: key,
          level: 'warning',
          title: d.title,
          message: d.message,
          source: 'session',
          since,
          meta: { ...d.meta, missingSinceMs: since },
        })
      }
    } else {
      for (const [key, d] of sessionCandidates) {
        alerts.push({
          id: key,
          level: 'warning',
          title: d.title,
          message: d.message,
          source: 'session',
          since: now,
          meta: { ...d.meta, missingSinceMs: now },
        })
      }
    }
  }

  return alerts
}
