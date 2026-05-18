import type {
  SessionSnapshot,
  DeviceSnapshot,
  DiskStatSnapshot,
  SessionThroughput,
  DeviceThroughput,
  DiskStatThroughput,
  ThroughputPoint,
} from './types'

/**
 * Ring buffer en mémoire pour le calcul des débits I/O (cf. SDD v2.2 §5.2).
 *
 * Conserve les MAX_POINTS+1 derniers snapshots par clé afin de toujours
 * avoir un snapshot précédent pour calculer le delta.
 *
 * MAX_POINTS = 12 × 10s = 2 minutes de sparkline.
 */

const SESSION_HISTORY = new Map<string, SessionSnapshot[]>()
const DEVICE_HISTORY = new Map<string, DeviceSnapshot[]>()
const MAX_POINTS = 12 // 12 × 10s = 2 min

function sessionKey(s: SessionSnapshot, sanId: string): string {
  return `${sanId}|${s.driver}|${s.target}|${s.initiator}`
}

function deviceKey(d: DeviceSnapshot, sanId: string): string {
  return `${sanId}|${d.handler}|${d.device}`
}

/**
 * Calcule un débit en KB/s à partir de deux valeurs cumulatives.
 * Retourne 0 si le compteur a été remis à zéro (reboot) ou si dt ≤ 0.
 */
function calcDelta(curr: number, prev: number, dtMs: number): number {
  if (dtMs <= 0) return 0
  const delta = curr - prev
  if (delta < 0) return 0 // reboot ou reset du compteur
  return (delta / dtMs) * 1_000 // KB/s
}

export function pushSessionSnapshots(
  snapshots: SessionSnapshot[],
  sanId = '__default__',
): SessionThroughput[] {
  const results: SessionThroughput[] = []

  for (const snap of snapshots) {
    const key = sessionKey(snap, sanId)
    const history = SESSION_HISTORY.get(key) ?? []

    let readKbps = 0
    let writeKbps = 0

    if (history.length > 0) {
      const prev = history[history.length - 1]
      const dt = snap.capturedAt - prev.capturedAt
      readKbps = calcDelta(snap.readKb, prev.readKb, dt)
      writeKbps = calcDelta(snap.writeKb, prev.writeKb, dt)
    }

    history.push(snap)
    if (history.length > MAX_POINTS + 1) history.shift()
    SESSION_HISTORY.set(key, history)

    const sparkHistory: ThroughputPoint[] = history
      .slice(-MAX_POINTS)
      .map((s, i, arr) => {
        if (i === 0) return { t: s.capturedAt, readKbps: 0, writeKbps: 0 }
        const prev = arr[i - 1]
        const dt = s.capturedAt - prev.capturedAt
        return {
          t: s.capturedAt,
          readKbps: calcDelta(s.readKb, prev.readKb, dt),
          writeKbps: calcDelta(s.writeKb, prev.writeKb, dt),
        }
      })

    results.push({
      target: snap.target,
      initiator: snap.initiator,
      lunsCount: snap.lunsCount,
      readKbTotal: snap.readKb,
      writeKbTotal: snap.writeKb,
      readKbPerSec: Math.round(readKbps),
      writeKbPerSec: Math.round(writeKbps),
      history: sparkHistory,
    })
  }

  return results
}

export function pushDeviceSnapshots(
  snapshots: DeviceSnapshot[],
  sanId = '__default__',
): DeviceThroughput[] {
  const results: DeviceThroughput[] = []

  for (const snap of snapshots) {
    const key = deviceKey(snap, sanId)
    const history = DEVICE_HISTORY.get(key) ?? []

    let readKbps = 0
    let writeKbps = 0
    let readOps = 0
    let writeOps = 0

    if (history.length > 0) {
      const prev = history[history.length - 1]
      const dt = snap.capturedAt - prev.capturedAt
      readKbps = calcDelta(snap.readKb, prev.readKb, dt)
      writeKbps = calcDelta(snap.writeKb, prev.writeKb, dt)
      readOps = calcDelta(snap.readOps, prev.readOps, dt)
      writeOps = calcDelta(snap.writeOps, prev.writeOps, dt)
    }

    history.push(snap)
    if (history.length > MAX_POINTS + 1) history.shift()
    DEVICE_HISTORY.set(key, history)

    const sparkHistory: ThroughputPoint[] = history
      .slice(-MAX_POINTS)
      .map((s, i, arr) => {
        if (i === 0) return { t: s.capturedAt, readKbps: 0, writeKbps: 0 }
        const prev = arr[i - 1]
        const dt = s.capturedAt - prev.capturedAt
        return {
          t: s.capturedAt,
          readKbps: calcDelta(s.readKb, prev.readKb, dt),
          writeKbps: calcDelta(s.writeKb, prev.writeKb, dt),
        }
      })

    results.push({
      device: snap.device,
      handler: snap.handler,
      readKbTotal: snap.readKb,
      writeKbTotal: snap.writeKb,
      readKbPerSec: Math.round(readKbps),
      writeKbPerSec: Math.round(writeKbps),
      readOpsPerSec: Math.round(readOps),
      writeOpsPerSec: Math.round(writeOps),
      history: sparkHistory,
    })
  }

  return results
}

// ─── Disk stats (/proc/diskstats) ────────────────────────────────────────────

const DISK_HISTORY = new Map<string, DiskStatSnapshot[]>()

function diskKey(d: DiskStatSnapshot, sanId: string): string {
  return `${sanId}|${d.device}`
}

export function pushDiskStatSnapshots(
  snapshots: DiskStatSnapshot[],
  sanId = '__default__',
): DiskStatThroughput[] {
  const results: DiskStatThroughput[] = []

  for (const snap of snapshots) {
    const key = diskKey(snap, sanId)
    const history = DISK_HISTORY.get(key) ?? []

    let readKbps  = 0
    let writeKbps = 0
    let readOps   = 0
    let writeOps  = 0

    if (history.length > 0) {
      const prev = history[history.length - 1]
      const dt = snap.capturedAt - prev.capturedAt
      // sectors → KB  (1 sector = 512 B = 0.5 KB)
      readKbps  = calcDelta(snap.sectorsRead    * 0.5, prev.sectorsRead    * 0.5, dt)
      writeKbps = calcDelta(snap.sectorsWritten * 0.5, prev.sectorsWritten * 0.5, dt)
      readOps   = calcDelta(snap.readsCompleted,  prev.readsCompleted,  dt)
      writeOps  = calcDelta(snap.writesCompleted, prev.writesCompleted, dt)
    }

    history.push(snap)
    if (history.length > MAX_POINTS + 1) history.shift()
    DISK_HISTORY.set(key, history)

    const sparkHistory: ThroughputPoint[] = history
      .slice(-MAX_POINTS)
      .map((s, i, arr) => {
        if (i === 0) return { t: s.capturedAt, readKbps: 0, writeKbps: 0 }
        const prev = arr[i - 1]
        const dt = s.capturedAt - prev.capturedAt
        return {
          t: s.capturedAt,
          readKbps:  calcDelta(s.sectorsRead    * 0.5, prev.sectorsRead    * 0.5, dt),
          writeKbps: calcDelta(s.sectorsWritten * 0.5, prev.sectorsWritten * 0.5, dt),
        }
      })

    results.push({
      device:          snap.device,
      readKbPerSec:    Math.round(readKbps),
      writeKbPerSec:   Math.round(writeKbps),
      readOpsPerSec:   Math.round(readOps),
      writeOpsPerSec:  Math.round(writeOps),
      iosInProgress:   snap.iosInProgress,
      history:         sparkHistory,
    })
  }

  return results
}
