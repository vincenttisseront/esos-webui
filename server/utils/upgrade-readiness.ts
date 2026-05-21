import { createError } from 'h3'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getSSHPool } from './ssh-pool'
import { parseInstalledVersion } from './esos-version-reader'
import { parseDRBDJson } from './parsers/drbd.parser'
import { readClusterNodeStatus } from './cluster-reader'
import { resolveClusterMembers, type ClusterSanMember } from './cluster-resolve'
import type {
  UpgradeCheck,
  UpgradeNodeReadiness,
  UpgradeReadinessLevel,
  UpgradeReadinessReport,
} from '~/types/upgrade'
import type { InstalledESOSVersion } from './types'

export const REQUIRED_TMP_BYTES = 5 * 1024 * 1024 * 1024
export const WARN_TMP_BYTES = 6 * 1024 * 1024 * 1024
export const MIN_RAM_MB_BLOCKED = 2048
export const MIN_RAM_MB_WARN = 4096

const VERSION_CMD =
  'cat /etc/esos-release 2>/dev/null || grep -oP \'(?<=VERSION=).*\' /etc/os-release 2>/dev/null || echo ""'

/** Allowlisted probe bundle (markers must stay in sync with parsers). */
export const UPGRADE_PROBE_CMD = [
  'echo "%%VERSION%%"',
  VERSION_CMD,
  'echo "%%TMP_DF%%"',
  'df -B1 /tmp 2>/dev/null || echo ""',
  'echo "%%TMP_MOUNT%%"',
  'mount 2>/dev/null | grep " /tmp " || echo ""',
  'echo "%%FREE_M%%"',
  'free -m 2>/dev/null | head -3 || echo ""',
  'echo "%%CONF_SYNC%%"',
  '(test -x /usr/local/sbin/conf_sync.sh && echo /usr/local/sbin/conf_sync.sh) || (command -v conf_sync.sh 2>/dev/null) || echo ""',
  'echo "%%BOOT%%"',
  'ls -la /boot 2>/dev/null | head -8 || echo ""',
  'echo "%%DRBD%%"',
  'drbdadm status --json 2>/dev/null || echo DRBD_UNAVAILABLE',
  'echo "%%RAID_CLI%%"',
  'which MegaCli64 storcli64 ssacli perccli 2>/dev/null | head -5 || echo ""',
].join('; ')

export function parseProbeSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = raw.split(/%%([A-Z_]+)%%/)
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i]
    const body = (parts[i + 1] ?? '').trim()
    sections[key] = body
  }
  return sections
}

export function parseTmpFreeBytes(dfOutput: string): number | null {
  const lines = dfOutput.trim().split('\n').filter(Boolean)
  for (const line of lines) {
    if (line.startsWith('Filesystem')) continue
    const cols = line.split(/\s+/)
    if (cols.length >= 4) {
      const avail = Number.parseInt(cols[3], 10)
      if (!Number.isNaN(avail)) return avail
    }
  }
  return null
}

export function parseRamAvailableMb(freeOutput: string): number | null {
  const lines = freeOutput.trim().split('\n')
  for (const line of lines) {
    if (line.toLowerCase().startsWith('mem:')) {
      const cols = line.split(/\s+/)
      const avail = Number.parseInt(cols[6] ?? cols[3] ?? '', 10)
      if (!Number.isNaN(avail)) return avail
    }
    if (line.toLowerCase().includes('mem') && line.includes('available')) {
      const m = line.match(/(\d+)\s*$/)
      if (m) return Number.parseInt(m[1], 10)
    }
  }
  const memLine = lines.find(l => /^Mem:/i.test(l))
  if (memLine) {
    const cols = memLine.trim().split(/\s+/)
    const avail = Number.parseInt(cols[6] ?? '', 10)
    if (!Number.isNaN(avail)) return avail
  }
  return null
}

export function levelFromChecks(checks: UpgradeCheck[]): UpgradeReadinessLevel {
  if (checks.some(c => c.level === 'blocked' && !c.ok)) return 'blocked'
  if (checks.some(c => c.level === 'warning')) return 'warning'
  return 'ready'
}

export function aggregateOverallLevel(nodes: UpgradeNodeReadiness[]): UpgradeReadinessLevel {
  if (nodes.some(n => n.level === 'blocked')) return 'blocked'
  if (nodes.some(n => n.level === 'warning')) return 'warning'
  return 'ready'
}

export function buildSummaryCodes(nodes: UpgradeNodeReadiness[], overall: UpgradeReadinessLevel): string[] {
  const codes: string[] = []
  if (overall === 'ready') codes.push('admin.upgrade.summary.ready')
  else if (overall === 'warning') codes.push('admin.upgrade.summary.warning')
  else codes.push('admin.upgrade.summary.blocked')

  const blockedIds = new Set<string>()
  for (const n of nodes) {
    for (const c of n.checks) {
      if (c.level === 'blocked' && !c.ok) blockedIds.add(c.id)
    }
  }
  if (blockedIds.has('san_writable')) codes.push('admin.upgrade.summary.blocked_readonly')
  if (blockedIds.has('ssh_connected')) codes.push('admin.upgrade.summary.blocked_ssh')
  if (blockedIds.has('tmp_free_space')) codes.push('admin.upgrade.summary.blocked_tmp')
  if (blockedIds.has('cluster_healthy') || blockedIds.has('peer_reachable')) {
    codes.push('admin.upgrade.summary.blocked_cluster')
  }
  return codes
}

export function evaluateNodeChecksFromProbe(input: {
  sanId: string
  label: string
  readOnly: boolean
  sshConnected: boolean
  sections: Record<string, string>
  installed: InstalledESOSVersion
  clusterEnabled: boolean
  clusterHealthy?: boolean
  peerReachable?: boolean
  peerSanId?: string | null
  peerLabel?: string | null
  clusterRole?: string | null
}): UpgradeCheck[] {
  const checks: UpgradeCheck[] = []

  checks.push({
    id: 'ssh_connected',
    level: input.sshConnected ? 'ready' : 'blocked',
    ok: input.sshConnected,
    detail: input.sshConnected ? 'SSH connecté' : 'SSH non disponible',
  })

  checks.push({
    id: 'san_writable',
    level: input.readOnly ? 'blocked' : 'ready',
    ok: !input.readOnly,
    detail: input.readOnly ? 'SAN en lecture seule' : 'SAN modifiable',
  })

  const versionRaw = input.sections.VERSION?.trim() ?? ''
  const installed = versionRaw ? parseInstalledVersion(versionRaw.split('\n')[0]?.trim() ?? '') : input.installed
  const versionOk = Boolean(installed.raw)
  let versionLevel: UpgradeReadinessLevel = 'ready'
  if (!versionOk) versionLevel = 'blocked'
  else if (installed.buildType === 'unknown') versionLevel = 'warning'
  checks.push({
    id: 'esos_version',
    level: versionLevel,
    ok: versionOk,
    detail: installed.raw || 'Version introuvable',
    meta: { buildType: installed.buildType, version: installed.version },
  })

  const tmpFree = parseTmpFreeBytes(input.sections.TMP_DF ?? '')
  const tmpMount = (input.sections.TMP_MOUNT ?? '').trim()
  checks.push({
    id: 'tmp_mount',
    level: tmpMount ? 'ready' : 'warning',
    ok: true,
    detail: tmpMount || '/tmp (mount non listé)',
  })

  if (tmpFree === null) {
    checks.push({
      id: 'tmp_free_space',
      level: 'blocked',
      ok: false,
      detail: 'Impossible de lire l\'espace /tmp',
    })
  } else {
    let tmpLevel: UpgradeReadinessLevel = 'ready'
    let tmpOk = true
    if (tmpFree < REQUIRED_TMP_BYTES) {
      tmpLevel = 'blocked'
      tmpOk = false
    } else if (tmpFree < WARN_TMP_BYTES) {
      tmpLevel = 'warning'
    }
    checks.push({
      id: 'tmp_free_space',
      level: tmpLevel,
      ok: tmpOk,
      detail: `${(tmpFree / (1024 ** 3)).toFixed(2)} GiB libres (requis ≥ 5 GiB)`,
      meta: { freeBytes: tmpFree, requiredBytes: REQUIRED_TMP_BYTES },
    })
  }

  const ramMb = parseRamAvailableMb(input.sections.FREE_M ?? '')
  if (ramMb === null) {
    checks.push({
      id: 'ram_available',
      level: 'warning',
      ok: true,
      detail: 'RAM : lecture impossible',
    })
  } else {
    const ok = ramMb >= MIN_RAM_MB_WARN
    const blocked = ramMb < MIN_RAM_MB_BLOCKED
    checks.push({
      id: 'ram_available',
      level: blocked ? 'blocked' : ok ? 'ready' : 'warning',
      ok: !blocked,
      detail: `${ramMb} MiB disponibles`,
      meta: { ramMb },
    })
  }

  const confPath = (input.sections.CONF_SYNC ?? '').trim()
  const confOk = confPath.length > 0 && !confPath.includes('not found')
  checks.push({
    id: 'conf_sync_present',
    level: confOk ? 'ready' : 'blocked',
    ok: confOk,
    detail: confPath || 'conf_sync.sh introuvable',
  })

  const bootListing = (input.sections.BOOT ?? '').trim()
  checks.push({
    id: 'boot_slots',
    level: bootListing.length > 0 ? 'ready' : 'warning',
    ok: bootListing.length > 0,
    detail: bootListing ? 'Contenu /boot listé (vérifier slots manuellement)' : 'Impossible de lister /boot',
  })

  if (input.clusterEnabled) {
    checks.push({
      id: 'cluster_membership',
      level: 'ready',
      ok: true,
      detail: `Nœud cluster (${input.clusterRole ?? 'rôle inconnu'})`,
    })
    if (input.clusterHealthy !== undefined) {
      const healthy = Boolean(input.clusterHealthy)
      checks.push({
        id: 'cluster_healthy',
        level: healthy ? 'ready' : 'blocked',
        ok: healthy,
        detail: healthy ? 'Cluster sain' : 'Cluster dégradé ou incomplet',
      })
    }
    if (input.peerSanId) {
      const peerOk = Boolean(input.peerReachable)
      checks.push({
        id: 'peer_reachable',
        level: peerOk ? 'ready' : 'blocked',
        ok: peerOk,
        detail: peerOk
          ? `Pair ${input.peerLabel ?? input.peerSanId} joignable`
          : `Pair ${input.peerLabel ?? input.peerSanId} injoignable`,
      })
    }
  }

  const drbdRaw = input.sections.DRBD ?? ''
  const resources = parseDRBDJson(drbdRaw)
  const syncing = resources.filter(r => r.isSyncing)
  if (resources.length > 0) {
    checks.push({
      id: 'drbd_resync',
      level: syncing.length > 0 ? 'warning' : 'ready',
      ok: syncing.length === 0,
      detail: syncing.length > 0
        ? `Resynchronisation DRBD active (${syncing.map(r => r.name).join(', ')})`
        : 'Pas de resync DRBD active',
      meta: { syncingCount: syncing.length },
    })
  }

  const raidCli = (input.sections.RAID_CLI ?? '').trim()
  if (raidCli) {
    checks.push({
      id: 'raid_cli_present',
      level: 'ready',
      ok: true,
      detail: raidCli.split('\n').filter(Boolean).join(', ') || 'Aucun outil RAID détecté',
    })
  } else {
    checks.push({
      id: 'raid_cli_present',
      level: 'warning',
      ok: true,
      detail: 'Aucun outil RAID CLI détecté (optionnel)',
    })
  }

  return checks
}

async function probeNode(member: ClusterSanMember): Promise<{
  sections: Record<string, string>
  installed: InstalledESOSVersion
  sshConnected: boolean
}> {
  const pool = getSSHPool()
  const mgr = pool.get(member.id)
  if (!mgr || mgr.getStatus() !== 'connected') {
    return { sections: {}, installed: { raw: '', buildType: 'unknown' }, sshConnected: false }
  }
  try {
    const result = await mgr.exec(UPGRADE_PROBE_CMD, 25_000)
    const sections = parseProbeSections(result.stdout)
    const versionRaw = sections.VERSION?.trim().split('\n')[0]?.trim() ?? ''
    const installed = versionRaw ? parseInstalledVersion(versionRaw) : { raw: '', buildType: 'unknown' as const }
    return { sections, installed, sshConnected: true }
  } catch {
    return { sections: {}, installed: { raw: '', buildType: 'unknown' }, sshConnected: false }
  }
}

export async function assessNodeReadiness(
  member: ClusterSanMember,
  allMembers: ClusterSanMember[],
): Promise<UpgradeNodeReadiness> {
  const { sections, installed, sshConnected } = await probeNode(member)

  let clusterHealthy: boolean | undefined
  let peerReachable: boolean | undefined
  let peerSanId: string | null = null
  let peerLabel: string | null = null

  if (member.clusterEnabled || member.clusterId) {
    const peers = allMembers.filter(m => m.id !== member.id && m.clusterId === member.clusterId)
    if (peers.length > 0) {
      const peer = peers[0]
      peerSanId = peer.id
      peerLabel = peer.label
      const pool = getSSHPool()
      peerReachable = pool.get(peer.id)?.getStatus() === 'connected'
    }
    try {
      const status = await readClusterNodeStatus(
        member.id,
        member.host,
        (member.clusterRole === 'secondary' ? 'secondary' : 'primary') as 'primary' | 'secondary',
      )
      clusterHealthy = status.sshReady && status.corosyncRunning && status.pacemakerRunning
    } catch {
      clusterHealthy = false
    }
  }

  const checks = evaluateNodeChecksFromProbe({
    sanId: member.id,
    label: member.label,
    readOnly: member.readOnly,
    sshConnected,
    sections,
    installed,
    clusterEnabled: Boolean(member.clusterEnabled || member.clusterId),
    clusterHealthy,
    peerReachable,
    peerSanId,
    peerLabel,
    clusterRole: member.clusterRole,
  })

  const level = levelFromChecks(checks)

  const node: UpgradeNodeReadiness = {
    sanId: member.id,
    label: member.label,
    level,
    checks,
    installed,
  }

  if (member.clusterEnabled || member.clusterId) {
    node.cluster = {
      role: member.clusterRole,
      peerSanId,
      peerLabel,
      peerReachable: peerReachable ?? false,
      clusterHealthy: clusterHealthy ?? false,
    }
  }

  return node
}

export async function buildUpgradeReadinessReport(input: {
  sanId?: string
  clusterId?: string
  nodeIds?: string[]
}): Promise<UpgradeReadinessReport> {
  const db = getDB()
  let members: ClusterSanMember[]

  if (input.sanId) {
    const row = db.select().from(sans).where(eq(sans.id, input.sanId)).get()
    if (!row) {
      throw createError({ statusCode: 404, message: 'SAN introuvable' })
    }
    members = [row]
  } else {
    members = resolveClusterMembers({
      clusterId: input.clusterId,
      nodeIds: input.nodeIds,
    })
  }

  if (members.length === 0) {
    throw createError({ statusCode: 400, message: 'Aucun nœud à analyser' })
  }

  const nodes = await Promise.all(members.map(m => assessNodeReadiness(m, members)))
  const overall = aggregateOverallLevel(nodes)
  const summary = buildSummaryCodes(nodes, overall)

  const scope =
    members.length === 1
      ? { type: 'san' as const, id: members[0].id, label: members[0].label }
      : {
          type: 'cluster' as const,
          id: input.clusterId ?? members[0].clusterId ?? 'cluster',
          label: `Cluster (${members.length} nœuds)`,
        }

  return {
    scannedAt: Date.now(),
    scope,
    overall,
    summary,
    nodes,
  }
}
