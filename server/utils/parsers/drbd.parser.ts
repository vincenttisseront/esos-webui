/**
 * Parser DRBD — SDD v3.9
 * Supporte DRBD 9.x (JSON via drbdadm status --json) + fallback /proc/drbd
 */

export type DRBDRole      = 'Primary' | 'Secondary' | 'Unknown'
export type DRBDDiskState = 'UpToDate' | 'Inconsistent' | 'Outdated' | 'Diskless' | 'DUnknown' | 'Failed' | 'Negotiating'
export type DRBDConnState = 'Connected' | 'SyncSource' | 'SyncTarget' | 'PausedSyncS' | 'PausedSyncT'
                          | 'Connecting' | 'Disconnected' | 'Unconnected' | 'StandAlone'
                          | 'VerifyS' | 'VerifyT' | 'Established' | 'Unknown'

export interface DRBDResource {
  name:             string
  role:             DRBDRole
  diskState:        DRBDDiskState
  peerDiskState:    DRBDDiskState
  connState:        DRBDConnState
  peerRole:         DRBDRole
  peerNode:         string
  syncPercent:      number
  outOfSyncKB:      number
  sizeBytes:        number
  writtenKB:        number
  readKB:           number
  etaSeconds:       number | null
  isSyncing:        boolean
  hasCriticalAlert: boolean
}

export interface DRBDStatus {
  version:     string
  resources:   DRBDResource[]
  enabled:     boolean               // rc.drbd_enable=YES
  running:     boolean               // rc.drbd service actif (/etc/rc.d/rc.drbd status)
  available:   boolean               // DRBD installé et lisible
}

// ── Parser JSON principal (DRBD 9.x) ─────────────────────────────────────────

export function parseDRBDJson(raw: string): DRBDResource[] {
  if (!raw || raw.includes('DRBD_UNAVAILABLE')) return []

  let data: any[]
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(data)) return []

  return data.map((res: any): DRBDResource => {
    const device     = res.devices?.[0] ?? {}
    const connection = res.connections?.[0] ?? {}
    const peerDevice = connection.peer_devices?.[0] ?? {}

    const connState   = mapConnState(connection['connection-state'] ?? 'Unknown')
    const replication = mapConnState(peerDevice['replication-state'] ?? 'Unknown')

    // Connexion effective : préférer replication-state si Connected
    const effectiveConn = connState === 'Connected' ? replication : connState

    const syncPercent = peerDevice['percent-in-sync'] ?? 100
    const outOfSync   = peerDevice['out-of-sync'] ?? 0
    const isSyncing   = ['SyncSource', 'SyncTarget', 'PausedSyncS', 'PausedSyncT'].includes(effectiveConn)

    const diskState     = mapDiskState(device['disk-state'] ?? 'DUnknown')
    const peerDiskState = mapDiskState(peerDevice['peer-disk-state'] ?? 'DUnknown')

    const hasCriticalAlert =
      effectiveConn === 'StandAlone' ||
      diskState === 'Failed' ||
      peerDiskState === 'Failed'

    return {
      name:             res.name ?? '',
      role:             mapRole(res.role),
      diskState,
      peerDiskState,
      connState:        effectiveConn,
      peerRole:         mapRole(connection['peer-role']),
      peerNode:         connection.name ?? '',
      syncPercent:      Math.round(syncPercent * 100) / 100,
      outOfSyncKB:      outOfSync,
      sizeBytes:        device.size ?? 0,
      writtenKB:        Math.round((device.written ?? 0) / 1024),
      readKB:           Math.round((device.read ?? 0) / 1024),
      etaSeconds:       null,
      isSyncing,
      hasCriticalAlert,
    }
  })
}

// ── Parser /proc/drbd (fallback DRBD 8.x) ────────────────────────────────────

export function parseProcDRBD(raw: string): DRBDResource[] {
  if (!raw || raw.trim() === '' || raw.includes('DRBD_UNAVAILABLE')) return []

  const resources: DRBDResource[] = []
  const blocks = raw.split(/\n(?=\s*\d+:)/)

  for (const block of blocks) {
    const firstLine = block.split('\n').find(l => /^\s*\d+:/.test(l))
    if (!firstLine) continue

    const csMatch = firstLine.match(/cs:(\S+)/)
    const roMatch = firstLine.match(/ro:(\w+)\/(\w+)/)
    const dsMatch = firstLine.match(/ds:(\w+)\/(\w+)/)

    const connState     = mapConnState(csMatch?.[1] ?? 'Unknown')
    const role          = mapRole(roMatch?.[1])
    const peerRole      = mapRole(roMatch?.[2])
    const diskState     = mapDiskState(dsMatch?.[1] ?? 'DUnknown')
    const peerDiskState = mapDiskState(dsMatch?.[2] ?? 'DUnknown')

    const statsLine = block.split('\n').find(l => /ns:\d+/.test(l)) ?? ''
    const nr        = parseInt(statsLine.match(/nr:(\d+)/)?.[1] ?? '0')
    const dw        = parseInt(statsLine.match(/dw:(\d+)/)?.[1] ?? '0')

    const syncLine    = block.split('\n').find(l => l.includes("sync'ed:"))
    const syncMatch   = syncLine?.match(/sync'ed:\s+([\d.]+)%.*\((\d+)\/(\d+)\)/)
    const syncPercent = syncMatch ? parseFloat(syncMatch[1]) : 100
    const outOfSync   = syncMatch ? parseInt(syncMatch[2]) : 0
    const isSyncing   = ['SyncSource', 'SyncTarget', 'PausedSyncS', 'PausedSyncT'].includes(connState)

    const etaLine    = block.split('\n').find(l => l.includes('finish:'))
    const etaMatch   = etaLine?.match(/finish:\s+(\d+):(\d+):(\d+)/)
    const etaSeconds = etaMatch
      ? parseInt(etaMatch[1]) * 3600 + parseInt(etaMatch[2]) * 60 + parseInt(etaMatch[3])
      : null

    const idxMatch = firstLine.match(/^\s*(\d+):/)
    const name     = `drbd${idxMatch?.[1] ?? '?'}`

    resources.push({
      name,
      role,
      diskState,
      peerDiskState,
      connState,
      peerRole,
      peerNode:         '',
      syncPercent,
      outOfSyncKB:      outOfSync,
      sizeBytes:        0,
      writtenKB:        Math.round(dw / 1024),
      readKB:           Math.round(nr / 1024),
      etaSeconds,
      isSyncing,
      hasCriticalAlert: connState === 'StandAlone' || diskState === 'Failed',
    })
  }

  return resources
}

export function parseDRBDVersion(raw: string): string {
  return raw.match(/version:\s+(\S+)/)?.[1] ?? 'unknown'
}

// ── Parse combiné : JSON si dispo, sinon /proc/drbd ──────────────────────────

export function parseDRBDStatus(jsonRaw: string, procRaw: string, rcconfRaw: string, svcRaw: string = ''): DRBDStatus {
  let resources: DRBDResource[] = []
  let available = false
  let version   = 'unknown'

  if (jsonRaw && !jsonRaw.includes('DRBD_UNAVAILABLE') && jsonRaw.trim().startsWith('[')) {
    resources = parseDRBDJson(jsonRaw)
    available = true
    version   = '9.x'
  } else if (procRaw && !procRaw.includes('DRBD_UNAVAILABLE') && procRaw.includes('version:')) {
    resources = parseProcDRBD(procRaw)
    version   = parseDRBDVersion(procRaw)
    available = resources.length > 0
  }

  const enabled = rcconfRaw.toLowerCase().includes('rc.drbd_enable="yes"')
               || rcconfRaw.toLowerCase().includes("rc.drbd_enable='yes'")
               || rcconfRaw.toLowerCase().includes('rc.drbd_enable=yes')

  const running = svcRaw.includes('drbd=running')

  return { version, resources, enabled, running, available }
}

// ── Helpers de mapping ────────────────────────────────────────────────────────

function mapRole(raw?: string): DRBDRole {
  if (raw === 'Primary')   return 'Primary'
  if (raw === 'Secondary') return 'Secondary'
  return 'Unknown'
}

function mapDiskState(raw: string): DRBDDiskState {
  const valid: DRBDDiskState[] = ['UpToDate', 'Inconsistent', 'Outdated', 'Diskless', 'DUnknown', 'Failed', 'Negotiating']
  return valid.includes(raw as DRBDDiskState) ? (raw as DRBDDiskState) : 'DUnknown'
}

function mapConnState(raw: string): DRBDConnState {
  const valid: DRBDConnState[] = [
    'Connected', 'SyncSource', 'SyncTarget', 'PausedSyncS', 'PausedSyncT',
    'Connecting', 'Disconnected', 'Unconnected', 'StandAlone',
    'VerifyS', 'VerifyT', 'Established',
  ]
  return valid.includes(raw as DRBDConnState) ? (raw as DRBDConnState) : 'Unknown'
}

// ── Valeur vide (nœud hors ligne) ─────────────────────────────────────────────

export function emptyDRBDStatus(): DRBDStatus {
  return { version: 'unknown', resources: [], enabled: false, running: false, available: false }
}
