import { getSSHPool } from './ssh-pool'
import { withCache } from './cache'
import * as DmiParser   from './parsers/dmidecode.parser'
import * as CpuParser   from './parsers/cpu.parser'
import * as DiskParser  from './parsers/disks.parser'
import * as SmartParser from './parsers/smart.parser'
import * as PciParser   from './parsers/pci.parser'
import * as IpmiParser  from './parsers/ipmi.parser'
import type {
  SystemInventory, CPUInfo, DiskDevice, IPMIInfo,
  MemoryOverview, NetworkInterface, NetworkAddress, SoftRAID, RAIDMember,
} from './types'

const CACHE_TTL = 5 * 60 * 1_000  // 5 minutes

// ─── Bulk SSH command ────────────────────────────────────────────────────────

const INVENTORY_CMD = [
  'set -e',
  'echo "===HOSTNAME==="',
  'hostname',
  'echo "===KERNEL==="',
  'uname -r',
  'echo "===UPTIME==="',
  'cat /proc/uptime',
  'echo "===LOADAVG==="',
  'cat /proc/loadavg',
  'echo "===ESOS_VERSION==="',
  'cat /etc/esos-release 2>/dev/null || echo "unknown"',
  'echo "===CPUINFO==="',
  'lscpu',
  'echo "===MEMINFO==="',
  'cat /proc/meminfo',
  'echo "===DMIDECODE_SYSTEM==="',
  'dmidecode -t system 2>/dev/null',
  'echo "===DMIDECODE_BIOS==="',
  'dmidecode -t bios 2>/dev/null',
  'echo "===DMIDECODE_BASEBOARD==="',
  'dmidecode -t baseboard 2>/dev/null',
  'echo "===DMIDECODE_MEMORY==="',
  'dmidecode -t memory 2>/dev/null',
  'echo "===LSBLK==="',
  'lsblk -b -P -o NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,TRAN,MOUNTPOINT,STATE 2>/dev/null',
  'echo "===MDSTAT==="',
  'cat /proc/mdstat 2>/dev/null',
  'echo "===LSPCI==="',
  'lspci -vmm 2>/dev/null',
  'echo "===NETWORK_LINKS==="',
  'ip -j link show 2>/dev/null',
  'echo "===NETWORK_ADDRS==="',
  'ip -j addr show 2>/dev/null',
  'echo "===IPMI_SENSORS==="',
  "ipmitool sensor 2>/dev/null || ipmitool sdr 2>/dev/null || echo 'IPMI_UNAVAILABLE'",
  'echo "===FC_PORTS==="',
  'for host_dir in /sys/class/fc_host/host*/; do',
  '  [ -d "$host_dir" ] || continue',
  '  host=$(basename "$host_dir")',
  '  port_name=$(cat "$host_dir/port_name"   2>/dev/null || echo "unknown")',
  '  port_state=$(cat "$host_dir/port_state" 2>/dev/null || echo "unknown")',
  '  speed=$(cat "$host_dir/speed"           2>/dev/null || echo "unknown")',
  '  fabric_name=$(cat "$host_dir/fabric_name" 2>/dev/null || echo "unknown")',
  '  printf \'FC|%s|%s|%s|%s|%s\\n\' "$host" "$port_name" "$port_state" "$speed" "$fabric_name"',
  'done',
  'echo "===END==="',
].join('\n')

// ─── Public API ──────────────────────────────────────────────────────────────

export async function collectSystemInventory(sanId: string): Promise<SystemInventory> {
  return withCache(`sysinfo-${sanId}`, CACHE_TTL, () => _collect(sanId))
}

// ─── Collection pipeline ─────────────────────────────────────────────────────

async function _collect(sanId: string): Promise<SystemInventory> {
  const pool    = getSSHPool()
  const manager = pool.get(sanId)
  if (!manager) throw new Error(`No SSH manager for SAN: ${sanId}`)

  // ── Pass 1: bulk data ────────────────────────────────────────
  const bulk     = await manager.exec(INVENTORY_CMD, 60_000)
  const sections = splitSections(bulk.stdout)

  const hostname  = sections.HOSTNAME?.trim()    ?? 'unknown'
  const kernel    = sections.KERNEL?.trim()      ?? 'unknown'
  const osVersion = sections.ESOS_VERSION?.trim() ?? 'unknown'
  const uptime    = parseFloat(sections.UPTIME?.split(' ')[0] ?? '0')
  const loadAvg   = (sections.LOADAVG ?? '').split(' ').slice(0, 3).map(parseFloat) as [number, number, number]

  const system    = DmiParser.parseSystemDMI(sections.DMIDECODE_SYSTEM ?? '')
  const bios      = DmiParser.parseBIOSDMI(sections.DMIDECODE_BIOS ?? '')
  const baseBoard = DmiParser.parseBaseBoardDMI(sections.DMIDECODE_BASEBOARD ?? '')
  const memModules = DmiParser.parseMemoryModules(sections.DMIDECODE_MEMORY ?? '')
  const cpu       = CpuParser.parseLSCPU(sections.CPUINFO ?? '') as CPUInfo
  const memory    = parseMemInfo(sections.MEMINFO ?? '')
  const disksRaw  = DiskParser.parseLSBLK(sections.LSBLK ?? '')
  const pci       = PciParser.parseLSPCI(sections.LSPCI ?? '')
  const network   = parseNetworkData(sections.NETWORK_LINKS ?? '', sections.NETWORK_ADDRS ?? '')
  const raids     = parseMDStat(sections.MDSTAT ?? '')

  const ipmiRaw = sections.IPMI_SENSORS ?? ''
  const ipmi: IPMIInfo = IpmiParser.parseIPMIAll(ipmiRaw)

  // ── Pass 2: SMART (one SSH command for all disks) ─────────────
  const blockDiskNames = disksRaw
    .filter(d => d.type !== 'NVMe')
    .map(d => d.name)

  const smartMap = await collectSmartData(manager, blockDiskNames)

  const disks: DiskDevice[] = disksRaw.map(d => ({
    ...d,
    smart: smartMap.get(d.name),
  }))

  // ── Pass 3: ethtool (one SSH command for all interfaces) ───────
  const physicalIfaces = network
    .filter(n => !n.name.startsWith('lo') && !n.isBond)
    .map(n => n.name)

  const ethtoolMap = await collectEthtoolData(manager, physicalIfaces)
  const enrichedNet = network.map(n => ({
    ...n,
    speed:  ethtoolMap.get(n.name)?.speed  ?? null,
    duplex: ethtoolMap.get(n.name)?.duplex ?? null,
    driver: ethtoolMap.get(n.name)?.driver ?? null,
  }))

  return {
    sanId, scannedAt: Date.now(),
    hostname, osVersion, kernel, uptime, loadAvg,
    system, bios, baseBoard, cpu, memory, memModules,
    disks, raids, network: enrichedNet, pci, ipmi,
  }
}

// ─── SMART bulk collect ───────────────────────────────────────────────────────

async function collectSmartData(
  manager: { exec: (cmd: string, timeout: number) => Promise<{ stdout: string }> },
  diskNames: string[],
): Promise<Map<string, ReturnType<typeof SmartParser.parseSmartOutput>>> {
  if (!diskNames.length) return new Map()

  const cmd = diskNames.map(d =>
    `echo "===SMART_${d}==="; smartctl -A -H -i /dev/${d} 2>/dev/null || echo "SMART_UNAVAILABLE"`,
  ).join('\n')

  try {
    const result = await manager.exec(cmd, 90_000)
    return SmartParser.parseSmartBulk(result.stdout, diskNames)
  } catch {
    return new Map()
  }
}

// ─── Ethtool bulk collect ─────────────────────────────────────────────────────

async function collectEthtoolData(
  manager: { exec: (cmd: string, timeout: number) => Promise<{ stdout: string }> },
  ifaces: string[],
): Promise<Map<string, { speed: number | null; duplex: string | null; driver: string | null }>> {
  if (!ifaces.length) return new Map()

  const cmd = ifaces.map(i =>
    `echo "===ETHTOOL_${i}==="; ethtool ${i} 2>/dev/null; ethtool -i ${i} 2>/dev/null || echo "ETHTOOL_UNAVAILABLE"`,
  ).join('\n')

  try {
    const result = await manager.exec(cmd, 30_000)
    return IpmiParser.parseEthtoolBulk(result.stdout, ifaces)
  } catch {
    return new Map()
  }
}

// ─── Section splitter ────────────────────────────────────────────────────────

function splitSections(output: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const parts = output.split(/===([A-Z0-9_]+)===/)
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i]] = parts[i + 1] ?? ''
  }
  return sections
}

// ─── /proc/meminfo parser ─────────────────────────────────────────────────────

function parseMemInfo(output: string): MemoryOverview {
  const kv = new Map<string, number>()
  for (const line of output.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+)/)
    if (m) kv.set(m[1], parseInt(m[2], 10))
  }
  const total     = kv.get('MemTotal')     ?? 0
  const free      = kv.get('MemFree')      ?? 0
  const available = kv.get('MemAvailable') ?? 0
  const used      = total - free
  return {
    totalKb:     total,
    usedKb:      used,
    freeKb:      free,
    availableKb: available,
    swapTotalKb: kv.get('SwapTotal') ?? 0,
    swapUsedKb:  (kv.get('SwapTotal') ?? 0) - (kv.get('SwapFree') ?? 0),
    usedPct:     total > 0 ? Math.round((used / total) * 100) : 0,
  }
}

// ─── Network parser (ip -j output) ───────────────────────────────────────────

function parseNetworkData(linksJson: string, addrsJson: string): NetworkInterface[] {
  interface IPLink { ifname: string; address: string; flags: string[]; mtu: number; operstate: string; linkinfo?: { info_kind?: string }; master?: string }
  interface IPAddr { ifname: string; addr_info: { family: string; local: string; prefixlen: number }[] }

  let links: IPLink[] = []
  let addrs: IPAddr[] = []

  try { links = JSON.parse(linksJson.trim()) } catch { return [] }
  try { addrs = JSON.parse(addrsJson.trim()) } catch { /* ignore */ }

  const addrMap = new Map<string, NetworkAddress[]>()
  for (const a of addrs) {
    const list = (a.addr_info ?? [])
      .filter(ai => ai.family === 'inet' || ai.family === 'inet6')
      .map(ai => ({
        address:   ai.local,
        prefixLen: ai.prefixlen,
        family:    ai.family as 'inet' | 'inet6',
      }))
    if (list.length) addrMap.set(a.ifname, list)
  }

  return links
    .filter(l => l.ifname !== 'lo')
    .map(l => {
      const isBond = l.linkinfo?.info_kind === 'bond'
      return {
        name:       l.ifname,
        macAddress: l.address ?? '',
        state:      l.operstate === 'UP' ? 'up' : l.operstate === 'DOWN' ? 'down' : 'unknown',
        mtu:        l.mtu ?? 1500,
        speed:      null,
        duplex:     null,
        addresses:  addrMap.get(l.ifname) ?? [],
        driver:     null,
        isBond,
        bondSlaves: [],
      } satisfies NetworkInterface
    })
}

// ─── /proc/mdstat parser ──────────────────────────────────────────────────────

function parseMDStat(output: string): SoftRAID[] {
  const raids: SoftRAID[] = []
  if (!output || output.includes('unused devices: <none>')) {
    // Check for any md devices anyway
  }

  // Parse "md0 : active raid1 sda1[0] sdb1[1]"
  const devicePattern = /^(md\d+)\s*:\s+(\w+)\s+(\w+)\s+(.+)$/gm
  let m: RegExpExecArray | null

  while ((m = devicePattern.exec(output)) !== null) {
    const [, device, state, level, rest] = m

    const members: RAIDMember[] = []
    const memberPattern = /(\w+)\[(\d+)\](\(F\)|\(S\))?/g
    let mm: RegExpExecArray | null
    while ((mm = memberPattern.exec(rest)) !== null) {
      members.push({
        disk:  mm[1],
        state: mm[3] === '(F)' ? 'faulty' : mm[3] === '(S)' ? 'spare' : 'active',
      })
    }

    // Size from "NNNN blocks" line
    const sizeMatch = /(\d+) blocks/.exec(output)
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0

    // Resync progress
    let resync: SoftRAID['resync']
    const resyncMatch = /(\w+)\s*=\s*([\d.]+)%\s+\([\d/]+\)\s+finish=[\d.]+min\s+speed=([\d.]+K\/sec)/.exec(output)
    if (resyncMatch) {
      resync = {
        action: resyncMatch[1],
        pct:    parseFloat(resyncMatch[2]),
        speed:  resyncMatch[3],
      }
    }

    raids.push({
      device,
      level:   level.replace('raid', 'RAID '),
      state,
      size,
      members,
      resync,
    })
  }

  return raids
}
