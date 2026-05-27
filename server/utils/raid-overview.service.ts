/**
 * Orchestrateur du scan RAID complet (SDD v3.12.1).
 * Lit les données depuis ESOS via SSH et construit la RaidOverviewResponse.
 */
import type { SSHSessionManager } from './ssh-session-manager'
import type {
  RaidOverviewResponse, RaidToolsInfo, RaidBlockDevice,
  MdArray, HardwareRaidController, MdExamineInfo,
  StoppedMdArray,
} from './raid-types'
import { parseMdstat } from './parsers/mdstat.parser'
import { parseMdadmDetail } from './parsers/mdadm-detail.parser'
import { parseMdadmExamineBulk } from './parsers/mdadm-examine.parser'
import { discoverHardwareControllers } from './raid-hardware'
import { enrichHardwareLdOsPaths } from './hw-raid-os-mapper'
import { collectKernelRaidInfo } from './raid-pci-detection'
import { buildMdDetectionSummary, getMdEligibilityReasons } from './raid-md-detection'
import { detectStoppedMdArrays } from './stopped-md-arrays'
import { extractRaidCliFromToolsOutput, toolsOutputHasRaidCli } from '../../utils/raid-cli-path'
import { collectSystemProtectionForOverview, ESOS_SYSTEM_LABELS } from './esos-system-protection'

// ─── Commande bulk ───────────────────────────────────────────────────────────

const RAID_OVERVIEW_CMD = [
  // Outils disponibles
  'echo "===TOOLS==="',
  'which mdadm storcli storcli64 perccli perccli64 MegaCli64 megacli arcconf lsscsi lspci wipefs parted sfdisk fdisk partprobe udevadm 2>/dev/null || true',
  // Chemins connus pour les outils non dans PATH
  'for _p in /opt/MegaRAID/perccli/perccli64 /opt/MegaRAID/perccli/perccli /opt/MegaRAID/storcli/storcli64 /opt/MegaRAID/storcli/storcli /opt/dell/perccli/perccli64 /usr/sbin/perccli64 /usr/local/sbin/perccli64 /usr/sbin/storcli64 /usr/local/sbin/storcli64 /sbin/perccli64 /sbin/storcli64 /Opt/MegaRAID/Perccli/Perccli64; do [ -x "$_p" ] && echo "$_p"; done 2>/dev/null || true',
  'find /opt /Opt /usr/local/sbin /usr/sbin /sbin 2>/dev/null \\( -iname perccli64 -o -iname storcli64 \\) -type f -perm -111 2>/dev/null | head -3 || true',
  // Block devices complets
  'echo "===LSBLK==="',
  'lsblk -J -b -o NAME,KNAME,PATH,SIZE,TYPE,FSTYPE,LABEL,UUID,MODEL,SERIAL,WWN,VENDOR,ROTA,TRAN,MOUNTPOINT,STATE,PKNAME,PARTTYPE,PARTTYPENAME 2>/dev/null || lsblk -J -b -o NAME,KNAME,PATH,SIZE,TYPE,FSTYPE,LABEL,UUID,MODEL,SERIAL,VENDOR,ROTA,TRAN,MOUNTPOINT,STATE,PKNAME,PARTTYPE,PARTTYPENAME 2>/dev/null || lsblk -J -b -o NAME,KNAME,PATH,SIZE,TYPE,FSTYPE,LABEL,UUID,MODEL,SERIAL,VENDOR,ROTA,TRAN,MOUNTPOINT,STATE,PKNAME 2>/dev/null || echo "{}"',
  // Identifiants stables utiles pour comparer les disques entre nœuds
  'echo "===DISK_BY_ID==="',
  'for _l in /dev/disk/by-id/*; do [ -e "$_l" ] && printf "%s -> %s\\n" "$_l" "$(readlink -f "$_l")"; done 2>/dev/null || true',
  'echo "===UDEVADM==="',
  'if command -v udevadm >/dev/null 2>&1; then for _d in $(lsblk -nr -o PATH,TYPE 2>/dev/null | awk \'$2=="disk"||$2=="part"{print $1}\'); do echo "---DEVICE ${_d}---"; udevadm info --query=property --name "$_d" 2>/dev/null | grep -E "^(ID_SERIAL=|ID_WWN=|ID_MODEL=|ID_PATH=)" || true; done; fi',
  // mdstat
  'echo "===MDSTAT==="',
  'cat /proc/mdstat 2>/dev/null || echo ""',
  // mdadm --detail --scan
  'echo "===MDADM_SCAN==="',
  'mdadm --detail --scan 2>/dev/null || echo ""',
  // blkid pour signatures
  'echo "===BLKID==="',
  'blkid 2>/dev/null || echo ""',
  // Signatures détaillées read-only
  'echo "===WIPEFS==="',
  'for _d in $(lsblk -nr -o PATH,TYPE 2>/dev/null | awk \'$2=="disk"||$2=="part"{print $1}\'); do echo "---DEVICE ${_d}---"; wipefs -n "$_d" 2>/dev/null || true; done',
  // Superblocks MD existants read-only
  'echo "===MDADM_EXAMINE==="',
  'for _d in $(lsblk -nr -o PATH,TYPE 2>/dev/null | awk \'$2=="part"{print $1}\'); do echo "---DEVICE ${_d}---"; mdadm --examine "$_d" 2>/dev/null || true; done',
  // pvs pour LVM
  'echo "===PVS==="',
  'pvs --noheadings -o pv_name 2>/dev/null || echo ""',
  // SCST devices blockio
  'echo "===SCST_DEV==="',
  'grep -r "filename" /sys/kernel/scst_tgt/devices/*/blockio_configured 2>/dev/null | awk -F= \'{print $2}\' | tr -d " " || echo ""',
  'echo "===FINDMNT==="',
  'findmnt -n -o SOURCE,TARGET / /mnt/root 2>/dev/null || true',
  'echo "===ROOT_DEV==="',
  'readlink -f / 2>/dev/null || true',
  'echo "===END==="',
].join('\n')

// ─── Export principal ────────────────────────────────────────────────────────

export async function collectRaidOverview(manager: SSHSessionManager): Promise<RaidOverviewResponse> {
  // Run overview cmd and kernel detection in parallel
  const [overviewResult, kernelInfo] = await Promise.all([
    manager.exec(RAID_OVERVIEW_CMD, 45_000),
    collectKernelRaidInfo(manager),
  ])
  const { stdout } = overviewResult
  const sections = splitSections(stdout)

  const tools = parseTools(sections.TOOLS ?? '', kernelInfo)
  const resolvedCli = extractStorCliBin(sections.TOOLS ?? '')
  const lsblkJson = sections.LSBLK?.trim() ?? '{}'
  const blockDevices = parseLsblkJson(
    lsblkJson,
    sections.BLKID ?? '',
    sections.PVS ?? '',
    sections.SCST_DEV ?? '',
    sections.WIPEFS ?? '',
    sections.MDADM_EXAMINE ?? '',
    sections.DISK_BY_ID ?? '',
    sections.UDEVADM ?? '',
  )
  const mdadmScan = sections.MDADM_SCAN ?? ''
  const mdArrays = await parseMdArrays(manager, sections.MDSTAT ?? '', mdadmScan, blockDevices)
  const stoppedMdArrays = detectStoppedMdArrays({ mdadmScan, blockDevices, activeMdArrays: mdArrays })
  const discovered = await discoverHardwareControllers(manager, tools, resolvedCli, kernelInfo)
  const hardwareControllers = enrichHardwareLdOsPaths({
    controllers: discovered,
    blockDevices,
    kernelLogicalDrives: kernelInfo.kernelLogicalDrives,
    tools,
  })

  // Marquer les block devices utilisés par MD
  markMdUsage(blockDevices, mdArrays)

  const systemProtection = collectSystemProtectionForOverview(
    { blockDevices, hardwareControllers },
    {
      findmntLines: (sections.FINDMNT ?? '').split('\n'),
      rootRealPath: (sections.ROOT_DEV ?? '').split('\n').map(l => l.trim()).find(l => l.startsWith('/')) ?? undefined,
    },
  )

  const alerts = buildAlerts(mdArrays, hardwareControllers, tools, blockDevices, stoppedMdArrays)
  for (const w of systemProtection.warnings) {
    alerts.push({ severity: 'warning', code: 'esos_protection_detection', message: w })
  }
  for (const e of systemProtection.errors) {
    alerts.push({ severity: 'warning', code: 'esos_protection_detection', message: e })
  }

  const mdDetection = buildMdDetectionSummary({
    nodeSanId: '',
    nodeLabel: 'local',
    mdArrays,
    stoppedMdArrays,
    blockDevices,
  })

  return {
    scannedAt: Date.now(),
    tools,
    hardwareControllers,
    mdArrays,
    stoppedMdArrays,
    blockDevices,
    systemProtection,
    alerts,
    mdDetection,
  }
}

export function attachMdDetectionLabels(
  overview: RaidOverviewResponse,
  nodeSanId: string,
  nodeLabel: string,
): RaidOverviewResponse {
  const mdDetection = buildMdDetectionSummary({
    nodeSanId,
    nodeLabel,
    mdArrays: overview.mdArrays,
    stoppedMdArrays: overview.stoppedMdArrays,
    blockDevices: overview.blockDevices,
  })
  return { ...overview, mdDetection }
}

// ─── Parsing outils ──────────────────────────────────────────────────────────

// Extraction du chemin/nom exact du binaire StorCLI/PercCLI depuis la sortie which + chemins directs
// Retourne le chemin complet ou le nom court selon ce qui est trouvé en premier
function extractStorCliBin(toolsOutput: string): string | null {
  return extractRaidCliFromToolsOutput(toolsOutput)
}

function parseTools(toolsOutput: string, kernelInfo?: Awaited<ReturnType<typeof collectKernelRaidInfo>>): RaidToolsInfo {
  const lspciAvailable = (kernelInfo?.pciCandidates.length ?? 0) > 0 || toolsOutput.includes('lspci')
  const cliFlags = toolsOutputHasRaidCli(toolsOutput)
  return {
    mdadm:     toolsOutput.includes('mdadm'),
    lspci:     lspciAvailable,
    storcli:   cliFlags.storcli,
    perccli:   cliFlags.perccli,
    MegaCli64: toolsOutput.includes('MegaCli64') || toolsOutput.includes('megacli'),
    arcconf:   toolsOutput.includes('arcconf'),
    lsscsi:    toolsOutput.includes('lsscsi'),
    wipefs:    toolsOutput.includes('wipefs'),
    parted:    toolsOutput.includes('parted'),
    sfdisk:    toolsOutput.includes('sfdisk'),
    fdisk:     toolsOutput.includes('fdisk'),
    partprobe: toolsOutput.includes('partprobe'),
    udevadm:   toolsOutput.includes('udevadm'),
  }
}

// ─── Parsing lsblk JSON ───────────────────────────────────────────────────────

interface LsblkDevice {
  name: string
  kname?: string
  path?: string
  size?: string | number
  type?: string
  fstype?: string | null
  label?: string | null
  uuid?: string | null
  model?: string | null
  serial?: string | null
  wwn?: string | null
  vendor?: string | null
  rota?: boolean | string
  tran?: string | null
  mountpoint?: string | null
  state?: string | null
  pkname?: string | null
  parttype?: string | null
  parttypename?: string | null
  children?: LsblkDevice[]
}

function parseLsblkJson(
  json: string,
  blkidOutput: string,
  pvsOutput: string,
  scstOutput: string,
  wipefsOutput: string,
  mdadmExamineOutput: string,
  diskByIdOutput: string,
  udevadmOutput: string,
): RaidBlockDevice[] {
  let parsed: { blockdevices?: LsblkDevice[] } = {}
  try { parsed = JSON.parse(json) } catch { return [] }

  const pvSet = new Set(
    pvsOutput.split('\n').map(l => l.trim()).filter(Boolean),
  )
  const scstSet = new Set(
    scstOutput.split('\n').map(l => l.trim()).filter(Boolean),
  )
  const signatureMap = parseBlkid(blkidOutput)
  const wipefsMap = parseWipefs(wipefsOutput)
  const examineMap = parseMdadmExamineBulk(mdadmExamineOutput)
  const byIdMap = parseDiskById(diskByIdOutput)
  const udevMap = parseUdevadmInfo(udevadmOutput)

  const result: RaidBlockDevice[] = []
  flattenDevices(parsed.blockdevices ?? [], result, pvSet, scstSet, signatureMap, wipefsMap, examineMap, byIdMap, udevMap)
  enrichDiskPreparationEligibility(result)
  return result
}

function flattenDevices(
  devices: LsblkDevice[],
  out: RaidBlockDevice[],
  pvSet: Set<string>,
  scstSet: Set<string>,
  signatureMap: Map<string, string[]>,
  wipefsMap: Map<string, string[]>,
  examineMap: Map<string, MdExamineInfo>,
  byIdMap: Map<string, string[]>,
  udevMap: Map<string, Record<string, string>>,
  parent?: string,
): void {
  for (const dev of devices) {
    const path = dev.path ?? `/dev/${dev.name}`
    const sizeBytes = typeof dev.size === 'string' ? parseInt(dev.size, 10) : (dev.size ?? 0)
    const type = normalizeType(dev.type ?? '')
    const mountpoint = dev.mountpoint ?? undefined
    const fstype = dev.fstype ?? undefined
    const blkidTypes = signatureMap.get(path) ?? []
    const wipefsSignatures = wipefsMap.get(path) ?? []
    const mdExamine = examineMap.get(path)
    const hasMdSuperblock = !!mdExamine || blkidTypes.includes('linux_raid_member') || wipefsSignatures.includes('linux_raid_member')
    const isMounted = !!mountpoint && mountpoint !== '[SWAP]'
    const partitionTypeCode = dev.parttype?.trim().toLowerCase() || undefined
    const partitionTypeName = dev.parttypename?.trim() || undefined
    const partitionType = partitionTypeName ?? partitionTypeCode
    const udev = udevMap.get(path) ?? {}

    const usedBy: RaidBlockDevice['usedBy'] = []
    if (isMounted || mountpoint === '[SWAP]') usedBy.push('mounted')
    if (fstype && !['swap', 'linux_raid_member'].includes(fstype)) usedBy.push('filesystem')
    if (type === 'raid') usedBy.push('md')
    if (type === 'lvm') usedBy.push('lvm')
    if (pvSet.has(path) || pvSet.has(`/dev/${dev.name}`)) usedBy.push('lvm')
    if (scstSet.has(path) || scstSet.has(`/dev/${dev.name}`)) usedBy.push('scst')
    if (hasMdSuperblock) usedBy.push('md')
    if (blkidTypes.some(sig => !['linux_raid_member'].includes(sig))) usedBy.push('unknown_signature')
    if (wipefsSignatures.some(sig => !['linux_raid_member'].includes(sig))) usedBy.push('unknown_signature')

    const warnings: string[] = []
    if (usedBy.includes('unknown_signature')) {
      warnings.push(`Signatures détectées : ${[...blkidTypes, ...wipefsSignatures].filter(sig => sig !== 'linux_raid_member').join(', ')}`)
    }
    if (hasMdSuperblock) warnings.push('Superblock MD détecté')
    if (isMounted) warnings.push(`Monté sur ${mountpoint}`)

    const mdEligibilityReasons = getMdEligibilityReasons({
      type,
      usedBy,
      partitionTypeCode,
      partitionTypeName,
      hasMdSuperblock,
      mountpoint,
    })
    const eligibleForMd = mdEligibilityReasons.length === 0
    const eligibleForHardwareRaid = type === 'disk' && usedBy.length === 0

    out.push({
      name: dev.name,
      path,
      sizeBytes,
      type,
      model: dev.model?.trim() || undefined,
      serial: dev.serial?.trim() || undefined,
      wwn: dev.wwn?.trim() || udev.ID_WWN || undefined,
      byIdPaths: byIdMap.get(path),
      idSerial: udev.ID_SERIAL,
      idModel: udev.ID_MODEL,
      idPath: udev.ID_PATH,
      vendor: dev.vendor?.trim() || undefined,
      transport: dev.tran || undefined,
      rotational: dev.rota === true || dev.rota === '1',
      label: dev.label?.trim() || undefined,
      mountpoint: mountpoint || undefined,
      fstype: fstype || undefined,
      uuid: dev.uuid || undefined,
      parent: parent ?? dev.pkname ?? undefined,
      partitionType,
      partitionTypeCode,
      partitionTypeName,
      hasMdSuperblock,
      mdExamine,
      wipefsSignatures,
      blkidType: blkidTypes[0],
      mdEligibilityReasons,
      eligibleForMdPartitionPrep: false,
      mdPartitionPrepReasons: [],
      childrenPaths: [],
      diskSignatures: [...new Set([...blkidTypes, ...wipefsSignatures])],
      partitionTableType: detectPartitionTableType(wipefsSignatures),
      usedBy,
      eligibleForMd,
      eligibleForHardwareRaid,
      warnings,
    })

    if (dev.children?.length) {
      flattenDevices(dev.children, out, pvSet, scstSet, signatureMap, wipefsMap, examineMap, byIdMap, udevMap, dev.name)
    }
  }
}

function normalizeType(t: string): RaidBlockDevice['type'] {
  if (t === 'disk') return 'disk'
  if (t === 'part') return 'part'
  if (t === 'raid1' || t === 'raid' || t.startsWith('md')) return 'raid'
  if (t === 'lvm' || t === 'dm') return 'lvm'
  if (t === 'rom') return 'rom'
  return 'unknown'
}

function enrichDiskPreparationEligibility(devices: RaidBlockDevice[]): void {
  const byNameOrPath = new Map<string, RaidBlockDevice>()
  for (const dev of devices) {
    byNameOrPath.set(dev.name, dev)
    byNameOrPath.set(dev.path, dev)
  }

  for (const dev of devices) {
    if (!dev.parent) continue
    const parent = byNameOrPath.get(dev.parent) ?? byNameOrPath.get(`/dev/${dev.parent}`)
    if (!parent) continue
    parent.childrenPaths = [...new Set([...(parent.childrenPaths ?? []), dev.path])]
  }

  for (const dev of devices) {
    if (dev.type !== 'disk') {
      dev.eligibleForMdPartitionPrep = false
      dev.mdPartitionPrepReasons = ['Seuls les disques entiers sont éligibles']
      continue
    }

    const children = devices.filter(child => child.parent === dev.name || child.parent === dev.path)
    const childUsedBy = children.flatMap(child => child.usedBy)
    const childMounts = children.filter(child => child.mountpoint)
    const criticalUsage = [...dev.usedBy, ...childUsedBy].filter(u =>
      ['mounted', 'md', 'lvm', 'scst', 'filesystem', 'hardware_raid'].includes(u),
    )
    const reasons: string[] = []
    if (criticalUsage.includes('mounted') || childMounts.length > 0) reasons.push('Un montage est détecté sur le disque ou ses partitions')
    if (criticalUsage.includes('md')) reasons.push('Déjà utilisé par MD')
    if (criticalUsage.includes('lvm')) reasons.push('PV LVM détecté')
    if (criticalUsage.includes('scst')) reasons.push('Utilisé par SCST')
    if (criticalUsage.includes('filesystem')) reasons.push('Système de fichiers détecté')
    if (criticalUsage.includes('hardware_raid')) reasons.push('Utilisé par RAID matériel')

    const childSignatures = children.flatMap(child => child.diskSignatures ?? child.wipefsSignatures ?? [])
    dev.childrenPaths = children.map(child => child.path)
    dev.diskSignatures = [...new Set([...(dev.diskSignatures ?? []), ...childSignatures])]
    dev.partitionTableType = detectPartitionTableType(dev.diskSignatures)
    dev.mdPartitionPrepReasons = [...new Set(reasons)]
    dev.eligibleForMdPartitionPrep = reasons.length === 0
  }
}

function detectPartitionTableType(signatures: string[] = []): RaidBlockDevice['partitionTableType'] {
  const normalized = signatures.map(s => s.toLowerCase())
  if (normalized.includes('gpt')) return 'gpt'
  if (normalized.includes('dos') || normalized.includes('mbr')) return 'dos'
  return normalized.length > 0 ? 'unknown' : undefined
}

function parseBlkid(output: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const line of output.split('\n')) {
    const pathMatch = line.match(/^(\/dev\/\S+):/)
    const typeMatch = line.match(/TYPE="([^"]+)"/)
    if (pathMatch && typeMatch) {
      const sigs = map.get(pathMatch[1]) ?? []
      sigs.push(typeMatch[1])
      map.set(pathMatch[1], sigs)
    }
  }
  return map
}

function parseWipefs(output: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  let current: string | undefined
  let typeIndex = 2
  for (const line of output.split('\n')) {
    const marker = line.match(/^---DEVICE\s+(.+)---$/)
    if (marker) {
      current = marker[1].trim()
      if (!map.has(current)) map.set(current, [])
      typeIndex = 2
      continue
    }
    if (!current) continue
    const columns = line.trim().split(/\s+/)
    const headerTypeIndex = columns.findIndex(c => c.toLowerCase() === 'type')
    if (headerTypeIndex >= 0) {
      typeIndex = headerTypeIndex
      continue
    }
    const type = columns[typeIndex]
    if (!type) continue
    const sigs = map.get(current) ?? []
    if (!sigs.includes(type)) sigs.push(type)
    map.set(current, sigs)
  }
  return map
}

function parseDiskById(output: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const line of output.split('\n')) {
    const match = line.match(/^(\/dev\/disk\/by-id\/\S+)\s+->\s+(\/dev\/\S+)$/)
    if (!match) continue
    const link = match[1]
    const target = match[2]
    const existing = map.get(target) ?? []
    existing.push(link)
    map.set(target, [...new Set(existing)].sort())
  }
  return map
}

function parseUdevadmInfo(output: string): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>()
  let current: string | undefined
  for (const line of output.split('\n')) {
    const marker = line.match(/^---DEVICE\s+(.+)---$/)
    if (marker) {
      current = marker[1].trim()
      if (!map.has(current)) map.set(current, {})
      continue
    }
    if (!current) continue
    const kv = line.match(/^(ID_SERIAL|ID_WWN|ID_MODEL|ID_PATH)=(.+)$/)
    if (!kv) continue
    const info = map.get(current) ?? {}
    info[kv[1]] = kv[2].trim()
    map.set(current, info)
  }
  return map
}

// ─── Parse MD arrays enrichis ─────────────────────────────────────────────────

async function parseMdArrays(
  manager: SSHSessionManager,
  mdstat: string,
  mdadmScan: string,
  blockDevices: RaidBlockDevice[],
): Promise<MdArray[]> {
  const arrays = parseMdstat(mdstat)

  // Enrichir avec les UUIDs de mdadm --detail --scan
  for (const line of mdadmScan.split('\n')) {
    const m = line.match(/ARRAY\s+(\/dev\/\S+)\s+.*UUID=(\S+)/)
    if (m) {
      const arr = arrays.find(a => a.path === m[1])
      if (arr) arr.uuid = m[2]
    }
  }

  // Enrichir avec mdadm --detail si arrays présents
  if (arrays.length > 0) {
    const detailCmd = arrays.map(a =>
      `echo "===DETAIL_${a.name}==="; mdadm --detail ${a.path} 2>/dev/null || echo "UNAVAILABLE"`,
    ).join('\n')

    try {
      const { stdout } = await manager.exec(detailCmd, 30_000)
      const parts = stdout.split(/===DETAIL_(\w+)===/)
      for (let i = 1; i < parts.length; i += 2) {
        const arrName = parts[i]
        const detail = parseMdadmDetail(parts[i + 1] ?? '')
        const arr = arrays.find(a => a.name === arrName)
        if (arr && detail.members.length > 0) {
          arr.members = detail.members
          if (detail.uuid) arr.uuid = detail.uuid
          if (detail.metadataVersion) arr.metadataVersion = detail.metadataVersion
          if (detail.name) arr.nameFromMdadm = detail.name
          if (detail.chunkKb) arr.chunkKb = detail.chunkKb
          if (detail.sizeBytes) arr.sizeBytes = detail.sizeBytes
          if (detail.raidDevices) arr.raidDevices = detail.raidDevices
          if (detail.activeDevices !== undefined) arr.activeDevices = detail.activeDevices
          if (detail.workingDevices !== undefined) arr.workingDevices = detail.workingDevices
          if (detail.failedDevices !== undefined) arr.failedDevices = detail.failedDevices
          if (detail.spareDevices !== undefined) arr.spareDevices = detail.spareDevices
          if (detail.state) detailStateToArray(arr, detail.state)
        }
      }
    } catch { /* non bloquant */ }
  }

  // Détecter usage (lvm/fs/scst/mounted) via blockDevices
  for (const arr of arrays) {
    const dev = blockDevices.find(d => d.path === arr.path)
    if (dev) {
      arr.usedBy = dev.usedBy.filter(u =>
        ['filesystem', 'lvm', 'scst', 'mounted'].includes(u),
      ) as MdArray['usedBy']
    }
  }

  return arrays
}

function markMdUsage(blockDevices: RaidBlockDevice[], mdArrays: MdArray[]): void {
  const memberPaths = new Set(mdArrays.flatMap(a => a.members.map(m => m.path).filter(Boolean)))
  for (const dev of blockDevices) {
    if (memberPaths.has(dev.path) && !dev.usedBy.includes('md')) {
      dev.usedBy.push('md')
      dev.eligibleForMd = false
      dev.eligibleForHardwareRaid = false
      if (!dev.mdEligibilityReasons.includes('Déjà membre MD')) {
        dev.mdEligibilityReasons.push('Déjà membre MD')
      }
    }
  }
}

function detailStateToArray(arr: MdArray, detailState: string): void {
  arr.detailState = detailState
  const normalized = detailState.toLowerCase()
  if (arr.progress) return
  if (normalized.includes('recovering')) arr.state = 'recovering'
  else if (normalized.includes('resync')) arr.state = 'resync'
  else if (normalized.includes('degraded') || arr.failedDevices > 0 || arr.activeDevices < arr.raidDevices) arr.state = 'degraded'
  else if (normalized.includes('clean')) arr.state = 'clean'
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

const ESOS_LABELS = ESOS_SYSTEM_LABELS

function buildAlerts(
  mdArrays: MdArray[],
  controllers: HardwareRaidController[],
  tools: RaidToolsInfo,
  blockDevices: RaidBlockDevice[] = [],
  stoppedMdArrays: import('./raid-types').StoppedMdArray[] = [],
): RaidOverviewResponse['alerts'] {
  const alerts: RaidOverviewResponse['alerts'] = []

  if (stoppedMdArrays.length > 0) {
    const assemblable = stoppedMdArrays.filter(a => a.stoppedState === 'assemblable').length
    alerts.push({
      severity: 'info',
      code: assemblable > 0 ? 'stopped_md_with_assemblable' : 'stopped_md_detected',
      params: { count: stoppedMdArrays.length, assemblable },
      message: assemblable > 0
        ? `${stoppedMdArrays.length} tableau(x) MD arrêté(s) détecté(s) (${assemblable} assemblable(s))`
        : `${stoppedMdArrays.length} tableau(x) MD arrêté(s) détecté(s) sur ce nœud`,
    })
  }

  // ─── Labels ESOS dupliqués ─────────────────────────────────────────────────
  // Groupe les partitions ESOS par label, puis vérifie si plusieurs disques parents portent le même label
  const labelToDisks = new Map<string, Set<string>>()
  for (const dev of blockDevices) {
    if (!dev.label || !ESOS_LABELS.has(dev.label)) continue
    const disk = dev.parent ?? dev.path
    const disks = labelToDisks.get(dev.label) ?? new Set()
    disks.add(disk)
    labelToDisks.set(dev.label, disks)
  }

  const duplicatedLabels = [...labelToDisks.entries()]
    .filter(([, disks]) => disks.size > 1)

  if (duplicatedLabels.length > 0) {
    const allDisks = new Set(duplicatedLabels.flatMap(([, disks]) => [...disks]))
    const diskList = [...allDisks].map(d => `/dev/${d}`).join(' et ')
    const labelList = duplicatedLabels.map(([l]) => l).join(', ')
    alerts.push({
      severity: 'warning',
      code: 'esos_labels_duplicated',
      params: { labelList, diskList },
      message: `Labels ESOS dupliqués détectés (${labelList}) sur ${diskList}. blkid -L peut pointer vers l'un ou l'autre de façon non déterministe. Toute procédure automatisée devra demander confirmation.`,
    })
  }

  for (const arr of mdArrays) {
    if (arr.state === 'degraded' || arr.state === 'failed') {
      alerts.push({
        severity: arr.state === 'failed' ? 'critical' : 'critical',
        code: 'md_array_bad_state',
        params: { path: arr.path, state: arr.state },
        message: `Array ${arr.path} est en état ${arr.state}`,
      })
    }
    if (arr.state === 'recovering' || arr.state === 'resync') {
      alerts.push({
        severity: 'warning',
        code: 'md_array_resync',
        params: { path: arr.path, state: arr.state, percent: arr.progress?.percent ?? 0 },
        message: `Array ${arr.path} : ${arr.state} en cours (${arr.progress?.percent ?? 0}%)`,
      })
    }
  }

  for (const ctrl of controllers) {
    if (ctrl.managementMode === 'read_only_limited') {
      alerts.push({
        severity: 'warning',
        code: 'hw_read_only_limited',
        params: { model: ctrl.model },
        message: `Contrôleur RAID matériel détecté (${ctrl.model}), mais perccli/storcli est absent. Gestion RAID matérielle limitée à la lecture kernel.`,
      })
      continue
    }
    if (ctrl.health === 'critical') {
      alerts.push({
        severity: 'critical',
        code: 'hw_controller_critical',
        params: { model: ctrl.model },
        message: `Contrôleur RAID ${ctrl.model} : état critique`,
      })
    } else if (ctrl.health === 'warning') {
      alerts.push({
        severity: 'warning',
        code: 'hw_controller_warning',
        params: { model: ctrl.model },
        message: `Contrôleur RAID ${ctrl.model} : avertissement`,
      })
    }
    for (const ld of ctrl.logicalDrives) {
      if (ld.state === 'degraded' || ld.state === 'rebuilding') {
        alerts.push({
          severity: 'critical',
          code: 'hw_logical_drive_state',
          params: { id: ld.id, model: ctrl.model, state: ld.state },
          message: `Volume logique ${ld.id} (${ctrl.model}) : ${ld.state}`,
        })
      }
    }
    for (const pd of ctrl.physicalDrives) {
      if (pd.state === 'failed') {
        alerts.push({
          severity: 'critical',
          code: 'hw_physical_drive_failed',
          params: { slot: pd.slot, model: ctrl.model },
          message: `Disque physique slot ${pd.slot} (${ctrl.model}) : failed`,
        })
      }
    }
  }

  if (mdArrays.length === 0 && !tools.mdadm) {
    alerts.push({
      severity: 'info',
      code: 'mdadm_unavailable',
      message: 'mdadm non disponible sur ce nœud ESOS',
    })
  }

  return alerts
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
