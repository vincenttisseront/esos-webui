import { getActiveSSHManager, getCurrentSanId } from './ssh-runtime'
import { withCache } from './cache'
import type {
  SystemInfo,
  MemoryInfo,
  FCPort,
  BlockDevice,
  VolumeUsage,
  HardwareOverview,
} from './types'

/**
 * Lecture des informations hardware via SSH (cf. SDD v2.3 §4.1).
 * Chaque sous-collecte est mise en cache individuellement pour
 * minimiser les commandes SSH à chaque poll.
 */

// CPU stat précédent pour calcul delta — un par SAN
const prevCpuStats = new Map<string, { idle: number; total: number }>()

// Renvoie la clé de cache namespaced par SAN courant
function hwKey(name: string): string {
  const san = getCurrentSanId()
  return san ? `hw:${san}:${name}` : `hw:${name}`
}

// Points de montage surveillés pour les volumes
const WATCHED_MOUNTS = ['/mnt/vdisks/fs01', '/']

// ─── Collecte globale ────────────────────────────────────────────────────────

export async function readHardwareOverview(): Promise<HardwareOverview> {
  const [system, memory, fcPorts, disks, volumes] = await Promise.all([
    withCache(hwKey('system'), 15_000, readSystemInfo),
    withCache(hwKey('memory'), 15_000, readMemoryInfo),
    withCache(hwKey('fcports'), 30_000, readFCPorts),
    withCache(hwKey('disks'), 60_000, readBlockDevices),
    withCache(hwKey('volumes'), 30_000, readVolumeUsage),
  ])

  return { system, memory, fcPorts, disks, volumes, capturedAt: Date.now() }
}

// ─── System (CPU, load, uptime) ──────────────────────────────────────────────

async function readSystemInfo(): Promise<SystemInfo> {
  const manager = getActiveSSHManager()

  // Commande unique — les sorties sont délimitées par des newlines.
  // Ordre fixe : hostname / uptime / cpumodel / nproc / loadavg / /proc/stat
  const cmd = [
    'hostname',
    'cat /proc/uptime',
    "grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2",
    'nproc',
    'cat /proc/loadavg',
    "grep '^cpu ' /proc/stat",
  ].join('\n')

  const result = await manager.exec(cmd, 10_000)
  const lines = result.stdout
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const hostname = lines[0] ?? 'unknown'
  const uptime = parseFloat(lines[1]?.split(' ')[0] ?? '0')
  const cpuModel = lines[2]?.trim() ?? 'Unknown CPU'
  const cpuCores = parseInt(lines[3] ?? '1', 10)
  const loadParts = (lines[4] ?? '0 0 0').split(' ')
  const loadAvg: [number, number, number] = [
    parseFloat(loadParts[0] ?? '0'),
    parseFloat(loadParts[1] ?? '0'),
    parseFloat(loadParts[2] ?? '0'),
  ]
  const cpuUsagePct = parseCpuUsage(lines[5] ?? '')

  return { hostname, uptime, cpuModel, cpuCores, loadAvg, cpuUsagePct }
}

/** Calcule le % CPU depuis une ligne /proc/stat, avec delta par SAN. */
export function parseCpuUsage(statLine: string): number {
  // "cpu  user nice system idle iowait irq softirq ..."
  const parts = statLine.split(/\s+/).filter(Boolean).slice(1)
  const values = parts.map(Number)
  const idle = values[3] ?? 0
  const total = values.reduce((a, b) => a + b, 0)

  const sanKey = getCurrentSanId() ?? '__default__'
  const prev = prevCpuStats.get(sanKey)

  if (!prev) {
    prevCpuStats.set(sanKey, { idle, total })
    return 0
  }

  const deltaIdle = idle - prev.idle
  const deltaTotal = total - prev.total
  prevCpuStats.set(sanKey, { idle, total })

  if (deltaTotal <= 0) return 0
  return Math.round((1 - deltaIdle / deltaTotal) * 100)
}

// ─── Mémoire ─────────────────────────────────────────────────────────────────

async function readMemoryInfo(): Promise<MemoryInfo> {
  const manager = getActiveSSHManager()
  const result = await manager.exec(
    'grep -E "^(MemTotal|MemAvailable|Buffers|Cached):" /proc/meminfo',
    5_000,
  )

  const map: Record<string, number> = {}
  for (const line of result.stdout.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/)
    if (m) map[m[1]] = parseInt(m[2], 10)
  }

  const totalKb = map.MemTotal ?? 0
  const availableKb = map.MemAvailable ?? 0
  const buffersKb = map.Buffers ?? 0
  const cachedKb = map.Cached ?? 0
  const usedKb = totalKb - availableKb

  return {
    totalKb,
    availableKb,
    usedKb,
    buffersKb,
    cachedKb,
    usedPct: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
  }
}

// ─── Ports FC ────────────────────────────────────────────────────────────────

async function readFCPorts(): Promise<FCPort[]> {
  const manager = getActiveSSHManager()

  const cmd = [
    'for host_dir in /sys/class/fc_host/host*/; do',
    '  [ -d "$host_dir" ] || continue',
    '  host=$(basename "$host_dir")',
    "  port_name=$(cat \"$host_dir/port_name\" 2>/dev/null | sed 's/0x//' | sed 's/../&:/g' | sed 's/:$//' || echo '')",
    "  port_state=$(cat \"$host_dir/port_state\" 2>/dev/null || echo 'Unknown')",
    "  speed=$(cat \"$host_dir/speed\" 2>/dev/null || echo 'Unknown')",
    "  fabric=$(cat \"$host_dir/fabric_name\" 2>/dev/null | sed 's/0x//' | sed 's/../&:/g' | sed 's/:$//' || echo '')",
    "  symbolic=$(cat \"$host_dir/symbolic_name\" 2>/dev/null || echo '')",
    "  supported=$(cat \"$host_dir/supported_speeds\" 2>/dev/null || echo '')",
    "  printf '%s|%s|%s|%s|%s|%s|%s\\n' \"$host\" \"$port_name\" \"$port_state\" \"$speed\" \"$fabric\" \"$symbolic\" \"$supported\"",
    'done',
  ].join('\n')

  const result = await manager.exec(cmd, 10_000)
  const ports: FCPort[] = []

  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 4) continue
    const [
      host,
      portName,
      portState,
      speed,
      fabricName = '',
      symbolicName = '',
      supportedSpeeds = '',
    ] = parts

    ports.push({
      host,
      portName: formatWwn(portName),
      portState: normalizePortState(portState),
      speed: speed.trim(),
      fabricName: formatWwn(fabricName),
      symbolicName: symbolicName.trim(),
      supportedSpeeds: supportedSpeeds.trim(),
      source: 'sysfs',
    })
  }

  // Fallback : si aucun port trouvé via sysfs, lire les ports FC depuis SCST
  // (cas VM où /sys/class/fc_host n'est pas disponible mais SCST qla2x00t tourne)
  if (ports.length === 0) {
    const scstCmd = [
      'for tgt_dir in /sys/kernel/scst_tgt/targets/qla2x00t/*/; do',
      '  [ -d "$tgt_dir" ] || continue',
      '  name=$(basename "$tgt_dir")',
      '  enabled=$(cat "$tgt_dir/enabled" 2>/dev/null || echo 0)',
      '  printf "%s|%s\\n" "$name" "$enabled"',
      'done',
    ].join('\n')
    try {
      const scstResult = await manager.exec(scstCmd, 5_000)
      for (const line of scstResult.stdout.split('\n')) {
        const [name, enabled] = line.trim().split('|')
        if (!name) continue
        ports.push({
          host: 'scst',
          portName: formatWwn(name),
          portState: enabled === '1' ? 'Online' : 'Offline',
          speed: 'Unknown',
          fabricName: '',
          symbolicName: 'SCST qla2x00t',
          supportedSpeeds: '',
          source: 'scst',
        })
      }
    } catch { /* SCST non disponible, on ignore */ }
  }

  return ports
}

/** Exporte pour les tests unitaires (HW04). */
export function normalizePortState(raw: string): FCPort['portState'] {
  const s = raw.trim().toLowerCase()
  if (s === 'online' || s === 'linkup' || s === 'link up') return 'Online'
  if (s === 'offline' || s === 'not present') return 'Offline'
  if (s.includes('down')) return 'Link Down'
  return 'Unknown'
}

/** Exporte pour les tests unitaires (HW05). */
export function formatWwn(raw: string): string {
  const clean = raw.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  if (clean.length !== 16) return raw.trim()
  return (clean.match(/../g) as string[]).join(':')
}

// ─── Disques ─────────────────────────────────────────────────────────────────

async function readBlockDevices(): Promise<BlockDevice[]> {
  const manager = getActiveSSHManager()
  const result = await manager.exec(
    'lsblk -J -b -o NAME,SIZE,TYPE,MOUNTPOINT,RO',
    10_000,
  )

  try {
    const data = JSON.parse(result.stdout) as {
      blockdevices: unknown[]
    }
    return (data.blockdevices ?? []).map(parseBlockDevice)
  } catch {
    return []
  }
}

/** Exporte pour les tests unitaires (HW06). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseBlockDevice(raw: any): BlockDevice {
  return {
    name: raw.name as string,
    size: formatBytes(parseInt(raw.size ?? '0', 10)),
    sizeBytes: parseInt(raw.size ?? '0', 10),
    type: raw.type as 'disk' | 'part' | 'rom',
    mountpoint: (raw.mountpoint as string | null) || null,
    readOnly: raw.ro === '1' || raw.ro === true,
    children: raw.children?.map(parseBlockDevice),
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} T`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} G`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} M`
  return `${bytes} B`
}

// ─── Volumes montés ──────────────────────────────────────────────────────────

async function readVolumeUsage(): Promise<VolumeUsage[]> {
  const manager = getActiveSSHManager()

  // Chaque mountpoint produit une ligne MP|total|used|avail
  const cmd = WATCHED_MOUNTS.map(
    (mp) =>
      `df -k "${mp}" 2>/dev/null | tail -1 | awk '{print "${mp}|"$2"|"$3"|"$4}'`,
  ).join('\n')

  const result = await manager.exec(cmd, 10_000)
  const volumes: VolumeUsage[] = []

  for (const line of result.stdout.split('\n')) {
    const parts = line.trim().split('|')
    if (parts.length < 4) continue
    const [mountpoint, total, used, avail] = parts
    const totalKb = parseInt(total, 10) || 0
    const usedKb = parseInt(used, 10) || 0
    const availableKb = parseInt(avail, 10) || 0
    volumes.push({
      mountpoint,
      totalKb,
      usedKb,
      availableKb,
      usedPct: totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : 0,
    })
  }

  return volumes
}
