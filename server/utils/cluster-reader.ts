/**
 * Lecteur de statut cluster — SDD v3.8 §4.
 * Utilise les parsers propres (crm-mon XML, corosync-quorumtool, rc.conf, ALUA sysfs).
 */
import { getSSHPool } from './ssh-pool'
import { parseCrmMonXml }          from './parsers/crm-mon.parser'
import { parseCorosyncQuorumtool } from './parsers/corosync.parser'
import { parseClusterRcConf }      from './parsers/rcconf.parser'
import { parseALUASysfs }          from './parsers/alua.parser'
import { parseDRBDStatus, emptyDRBDStatus } from './parsers/drbd.parser'
import type {
  ClusterNodeStatus,
  ClusterNodeRole,
  PacemakerNodeState,
} from './types'

// ─── Probe script SSH (1 seul exec) ──────────────────────────────────────────

// Les séparateurs %% permettent un découpage fiable même si les commandes
// produisent des lignes vides ou multilignes.
const PROBE_LINES = [
  'echo "%%CRM_MON%%"',
  // Pacemaker 2.x: --output-as=xml ; Pacemaker 1.x: --as-xml (fallback)
  'crm_mon --output-as=xml --one-shot -r 2>/dev/null || crm_mon --as-xml --one-shot -r 2>/dev/null || echo "<crm_mon_error/>"',
  'echo "%%COROSYNC%%"',
  'corosync-quorumtool -p 2>/dev/null || echo "UNAVAILABLE"',
  'echo "%%RCCONF%%"',
  'grep -E \'rc\\.(corosync|pacemaker|scst)_enable\' /etc/rc.conf 2>/dev/null',
  'echo "%%SVCSTATUS%%"',
  'if /etc/rc.d/rc.corosync status >/dev/null 2>&1; then echo "corosync=running"; else echo "corosync=stopped"; fi',
  'if /etc/rc.d/rc.pacemaker status >/dev/null 2>&1; then echo "pacemaker=running"; else echo "pacemaker=stopped"; fi',
  'echo "%%ALUA%%"',
  'find /sys/kernel/scst_tgt/device_groups -name state 2>/dev/null | while read f; do echo "$f=$(cat "$f" 2>/dev/null)"; done',
  'echo "%%DRBD_JSON%%"',
  'drbdadm status --json 2>/dev/null || echo "DRBD_UNAVAILABLE"',
  'echo "%%DRBD_PROC%%"',
  'cat /proc/drbd 2>/dev/null || echo "DRBD_UNAVAILABLE"',
  'echo "%%DRBD_RCCONF%%"',
  'grep \'rc\\.drbd_enable\' /etc/rc.conf 2>/dev/null || echo "rc.drbd_enable=NO"',  'echo "%%DRBD_SVC%%"',
  'if /etc/rc.d/rc.drbd status >/dev/null 2>&1; then echo "drbd=running"; else echo "drbd=stopped"; fi',  'echo "%%HOSTNAME%%"',
  'cat /etc/HOSTNAME 2>/dev/null || hostname',
  'echo "%%END%%"',
]

export const PROBE_CMD = PROBE_LINES.join('; ')

// ─── Extraction d'une section entre deux marqueurs ───────────────────────────

const MARKERS = ['%%CRM_MON%%', '%%COROSYNC%%', '%%RCCONF%%', '%%SVCSTATUS%%', '%%ALUA%%', '%%DRBD_JSON%%', '%%DRBD_PROC%%', '%%DRBD_RCCONF%%', '%%DRBD_SVC%%', '%%HOSTNAME%%', '%%END%%']

function section(raw: string, name: string): string {
  const marker    = `%%${name}%%`
  const startPos  = raw.indexOf(marker)
  if (startPos === -1) return ''
  const after      = startPos + marker.length
  const markerIdx  = MARKERS.indexOf(marker)
  const nextMarker = MARKERS[markerIdx + 1]
  const endPos     = nextMarker ? raw.indexOf(nextMarker) : raw.length
  return raw.slice(after, endPos === -1 ? raw.length : endPos).trim()
}

// ─── Lecture principale ───────────────────────────────────────────────────────

export async function readClusterNodeStatus(
  nodeId: string,
  host:   string,
  role:   ClusterNodeRole,
): Promise<ClusterNodeStatus> {
  const pool = getSSHPool()
  const mgr  = pool.get(nodeId)

  if (!mgr || mgr.getStatus() !== 'connected') {
    return buildOfflineStatus(nodeId, host, role)
  }

  let raw: string
  try {
    const result = await mgr.exec(PROBE_CMD, 30_000)
    raw = result.stdout
  } catch {
    return buildOfflineStatus(nodeId, host, role)
  }

  // ── Parsing ────────────────────────────────────────────────────────────────
  try {
    const crm      = parseCrmMonXml(section(raw, 'CRM_MON'))
    const corosync = parseCorosyncQuorumtool(section(raw, 'COROSYNC'))
    const rcconf   = parseClusterRcConf(section(raw, 'RCCONF'))
    const svcRaw   = section(raw, 'SVCSTATUS')
    const alua     = parseALUASysfs(section(raw, 'ALUA'))
    const drbd     = parseDRBDStatus(section(raw, 'DRBD_JSON'), section(raw, 'DRBD_PROC'), section(raw, 'DRBD_RCCONF'), section(raw, 'DRBD_SVC'))
    const hostname = section(raw, 'HOSTNAME').split('.')[0] || host

    const corosyncRunning  = svcRaw.includes('corosync=running')
    const pacemakerRunning = svcRaw.includes('pacemaker=running')
    const quorate          = crm.quorum || corosync.quorate

    return {
      nodeId,
      hostname,
      host,
      role,
      clusterName:        crm.clusterName ?? '',
      corosyncEnabled:    rcconf.corosyncEnabled,
      corosyncRunning,
      pacemakerEnabled:   rcconf.pacemakerEnabled,
      pacemakerRunning,
      pacemakerNodeState: derivePacemakerState(corosyncRunning, pacemakerRunning),
      quorate,
      resources:          crm.resources,
      aluaGroups:         alua,
      drbd,
      sshReady:           true,
      lastChecked:        Date.now(),
    }
  } catch {
    return buildOfflineStatus(nodeId, host, role)
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function derivePacemakerState(
  corosyncRunning: boolean,
  pacemakerRunning: boolean,
): PacemakerNodeState {
  if (!corosyncRunning || !pacemakerRunning) return 'Offline'
  return 'Online'
}

function buildOfflineStatus(
  nodeId: string,
  host:   string,
  role:   ClusterNodeRole,
): ClusterNodeStatus {
  return {
    nodeId,
    hostname:           host,
    host,
    role,
    clusterName:        '',
    corosyncEnabled:    false,
    corosyncRunning:    false,
    pacemakerEnabled:   false,
    pacemakerRunning:   false,
    pacemakerNodeState: 'Unknown',
    quorate:            false,
    resources:          [],
    aluaGroups:         [],
    drbd:               emptyDRBDStatus(),
    sshReady:           false,
    lastChecked:        Date.now(),
  }
}


