/**
 * Détection PCI/kernel des contrôleurs RAID hardware (SDD v3.12.1 §5-§7).
 * Fonctionne sans CLI propriétaire : lspci, dmesg, lsscsi, /proc/scsi/scsi.
 */
import type { SSHSessionManager } from './ssh-session-manager'
import type { HardwareRaidController, HardwareRaidLogicalDrive, RaidVendor, RaidHealth, RaidControllerModeDetection } from './raid-types'

// ─── Types internes ───────────────────────────────────────────────────────────

export interface PciRaidCandidate {
  pciAddress: string
  rawLine: string
  vendor: RaidVendor
  model: string
  pciVendorId?: string
  pciDeviceId?: string
  subsystemVendorId?: string
  subsystemDeviceId?: string
}

export interface KernelExposedLogicalDrive {
  id: string
  scsiAddress: string
  hctl: string
  host: number
  channel: number
  target: number
  lun: number
  vendor: string
  model: string
  revision?: string
  devicePath?: string
  sgDevicePath?: string
  source: 'lsscsi' | 'dmesg' | 'proc_scsi'
}

export interface KernelRaidInfo {
  pciCandidates: PciRaidCandidate[]
  kernelLogicalDrives: KernelExposedLogicalDrive[]
  drivers: Record<string, string>   // pciAddress -> driver name
  dmesgRaw: string
  lsblkRaw: string
}

// ─── Commandes read-only ──────────────────────────────────────────────────────

export const RAID_KERNEL_CMD = [
  'echo "===LSPCI==="',
  "lspci -nn 2>/dev/null | grep -iE 'RAID bus controller|Serial Attached SCSI controller|SCSI storage controller|Mass storage controller' || lspci 2>/dev/null | grep -iE 'RAID bus controller|Serial Attached SCSI controller|SCSI storage controller|Mass storage controller' || true",
  'echo "===LSMOD==="',
  "lsmod 2>/dev/null | grep -iE 'megaraid|aacraid|mpt3sas|3w|aic|hpsa|cciss' || true",
  'echo "===DMESG==="',
  "dmesg 2>/dev/null | grep -iE 'megaraid_sas|aacraid|MegaRAID|PERC|Avago SAS based MegaRAID driver|scsi [0-9].*Direct-Access|pci id.*0x1000|invader' | tail -120 || true",
  'echo "===LSSCSI==="',
  'lsscsi -g 2>/dev/null || lsscsi 2>/dev/null || true',
  'echo "===PROC_SCSI==="',
  'cat /proc/scsi/scsi 2>/dev/null || true',
  'echo "===LSBLK_BASIC==="',
  "lsblk -o NAME,TYPE,VENDOR,MODEL -P 2>/dev/null || true",
  'echo "===END_KERNEL==="',
].join('\n')

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export async function collectKernelRaidInfo(manager: SSHSessionManager): Promise<KernelRaidInfo> {
  let stdout = ''
  try {
    const result = await manager.exec(RAID_KERNEL_CMD, 30_000)
    stdout = result.stdout
  } catch {
    return { pciCandidates: [], kernelLogicalDrives: [], drivers: {}, dmesgRaw: '' }
  }

  const sections = splitKernelSections(stdout)
  const dmesgRaw = sections.DMESG ?? ''

  return {
    pciCandidates: parseLspci(sections.LSPCI ?? ''),
    kernelLogicalDrives: [
      ...parseLsscsi(sections.LSSCSI ?? ''),
      ...parseProcScsi(sections.PROC_SCSI ?? ''),
      ...parseDmesgScsiDevices(dmesgRaw),
    ].filter(deduplicateLogicalDrives()),
    drivers: parseDriversFromLsmod(sections.LSMOD ?? '', dmesgRaw),
    dmesgRaw,
    lsblkRaw: sections.LSBLK_BASIC ?? '',
  }
}

// ─── Filtres de classe PCI ───────────────────────────────────────────────────

const RAID_PCI_INCLUDE_CLASSES = [
  'raid bus controller',
  'serial attached scsi controller',
  'scsi storage controller',
  'mass storage controller',
]

const RAID_PCI_EXCLUDE_CLASSES = [
  'pci bridge',
  'pcie switch',
  'pcie-pci bridge',
  'usb controller',
  'ethernet controller',
  'network controller',
  'vga compatible controller',
  'display controller',
  'smbus',
  'isa bridge',
]

function isKnownNonRaidBridge(line: string): boolean {
  const lower = line.toLowerCase()
  return (
    lower.includes('renesas technology corp. sh7758') ||
    lower.includes('pcie switch') ||
    lower.includes('pci bridge') ||
    lower.includes('pcie-pci bridge')
  )
}

export function isRaidControllerPciLine(line: string): boolean {
  const lower = line.toLowerCase()

  if (isKnownNonRaidBridge(line)) return false
  if (RAID_PCI_EXCLUDE_CLASSES.some((klass) => lower.includes(klass))) return false

  const hasRelevantClass = RAID_PCI_INCLUDE_CLASSES.some((klass) => lower.includes(klass))
  if (!hasRelevantClass) return false

  return (
    lower.includes('megaraid') ||
    lower.includes('perc') ||
    lower.includes('lsi') ||
    lower.includes('avago') ||
    lower.includes('broadcom') ||
    lower.includes('dell') ||
    lower.includes('adaptec') ||
    lower.includes('microsemi') ||
    lower.includes('sas-3 3108') ||
    lower.includes('invader')
  )
}

// ─── Parser lspci ─────────────────────────────────────────────────────────────

export function parseLspci(output: string): PciRaidCandidate[] {
  const candidates: PciRaidCandidate[] = []
  for (const line of output.split('\n')) {
    const l = line.trim()
    if (!l) continue

    // Reject non-RAID PCI classes (bridges, USB, Ethernet, etc.) before any other processing
    if (!isRaidControllerPciLine(l)) continue

    // Format: "02:00.0 RAID bus controller [0104]: LSI Logic ... [1000:005d] (rev 02)"
    //      or: "02:00.0 RAID bus controller: LSI Logic ..."
    const addrMatch = l.match(/^([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])\s/i)
    if (!addrMatch) continue

    const pciAddress = addrMatch[1]
    const rawLine = l

    // Extract PCI IDs from "[vendor:device]" pattern (lspci -nn output)
    const pciIdMatch = l.match(/\[([0-9a-f]{4}):([0-9a-f]{4})\](?:\s*\(rev [0-9a-f]+\))?$/i)
    const pciVendorId = pciIdMatch?.[1]
    const pciDeviceId = pciIdMatch?.[2]

    // Extract subsystem from "Subsystem: [sub_vendor:sub_device]" — lspci -vnn
    const subsysMatch = l.match(/Subsystem:.*\[([0-9a-f]{4}):([0-9a-f]{4})\]/i)
    const subsystemVendorId = subsysMatch?.[1]
    const subsystemDeviceId = subsysMatch?.[2]

    const { vendor, model } = classifyPciRaid(l, pciVendorId, pciDeviceId, subsystemVendorId, subsystemDeviceId)

    // Only include controllers with a known RAID vendor (reject 'unknown' to avoid false positives)
    if (vendor === 'unknown') continue

    candidates.push({ pciAddress, rawLine, vendor, model, pciVendorId, pciDeviceId, subsystemVendorId, subsystemDeviceId })
  }
  return candidates
}

function classifyPciRaid(
  line: string,
  pciVendorId?: string,
  pciDeviceId?: string,
  subsystemVendorId?: string,
  subsystemDeviceId?: string,
): { vendor: RaidVendor; model: string } {
  const lower = line.toLowerCase()

  // Dell PERC H730P Mini specific: PCI 1000:005d + subsystem 1028:1f47
  if (pciVendorId === '1000' && pciDeviceId === '005d' && subsystemVendorId === '1028' && subsystemDeviceId === '1f47') {
    return { vendor: 'dell_perc', model: 'Dell PERC H730P Mini / LSI MegaRAID SAS-3 3108 [Invader]' }
  }
  // Generic Dell PERC detection via subsystem vendor 1028 (Dell)
  if (subsystemVendorId === '1028' && (lower.includes('megaraid') || lower.includes('sas') || lower.includes('lsi') || lower.includes('broadcom') || lower.includes('1000:005'))) {
    return { vendor: 'dell_perc', model: extractPciModel(line) }
  }

  if (lower.includes('perc') || (lower.includes('dell') && lower.includes('raid'))) {
    return { vendor: 'dell_perc', model: extractPciModel(line) }
  }

  if (
    lower.includes('megaraid') ||
    lower.includes('lsi logic') ||
    lower.includes('lsi/symbios') ||
    lower.includes('avago') ||
    lower.includes('broadcom') ||
    (pciVendorId === '1000') // LSI Logic / Broadcom vendor ID
  ) {
    return { vendor: 'lsi_megaraid', model: extractPciModel(line) }
  }

  if (lower.includes('adaptec') || lower.includes('aacraid') || lower.includes('microsemi') || lower.includes('pmc-sierra')) {
    return { vendor: 'adaptec_aacraid', model: extractPciModel(line) }
  }

  return { vendor: 'unknown', model: extractPciModel(line) }
}

function extractPciModel(line: string): string {
  // Remove PCI address prefix
  const withoutAddr = line.replace(/^[0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f]\s+/i, '')
  // Remove class code "[xxxx]:"
  const withoutClass = withoutAddr.replace(/^[^:]+:\s*/, '')
  // Remove trailing PCI IDs "[xxxx:xxxx]" and "(rev xx)"
  return withoutClass.replace(/\s*\[[0-9a-f]{4}:[0-9a-f]{4}\]/gi, '').replace(/\s*\(rev [0-9a-f]+\)/i, '').trim() || 'Unknown RAID Controller'
}

// ─── Parser lsscsi ────────────────────────────────────────────────────────────

export function parseLsscsi(output: string): KernelExposedLogicalDrive[] {
  const drives: KernelExposedLogicalDrive[] = []
  for (const line of output.split('\n')) {
    const l = line.trim()
    if (!l) continue

    // Format: "[0:2:0:0]    disk    DELL     PERC H730P Mini  4.30  /dev/sda  /dev/sg0"
    // Capture SCSI address and type separately, then parse the remaining fixed-width columns
    const m = l.match(/^\[([^\]]+)\]\s+(\S+)\s+(.+)/)
    if (!m) continue

    const scsiAddress = m[1]
    const tuple = scsiAddress.split(':').map(v => Number.parseInt(v, 10))
    if (tuple.length !== 4 || tuple.some(n => Number.isNaN(n))) continue
    const devType = m[2]  // 'disk', 'enclosu', etc.
    if (devType !== 'disk') continue  // only expose disk-type SCSI devices

    const rest = m[3].trim()

    // lspci uses fixed-width columns: vendor(8) model(16) rev(4) /dev/sdX /dev/sgX
    // Split on 2+ spaces to respect those boundaries
    const parts = rest.split(/\s{2,}/)
    const vendorStr = (parts[0] ?? '').trim()
    const modelStr = (parts[1] ?? '').trim()
    const revision = (parts[2] ?? '').trim()

    // device path: prefer /dev/sd* over /dev/sg*
    const devPath = rest.match(/(\/dev\/sd[a-z]+)/)?.[1]
      ?? rest.match(/(\/dev\/[a-z][a-z0-9]+)/)?.[1]
    const sgPath = rest.match(/(\/dev\/sg\d+)/)?.[1]

    // Only include devices that look like they come from a RAID controller
    const combined = `${vendorStr} ${modelStr}`.toLowerCase()
    if (
      !combined.includes('perc') &&
      !combined.includes('megaraid') &&
      !combined.includes('dell') &&
      !combined.includes('lsi') &&
      !combined.includes('avago') &&
      !combined.includes('broadcom')
    ) {
      continue
    }

    drives.push({
      id: `scsi-${scsiAddress}`,
      scsiAddress,
      hctl: scsiAddress,
      host: tuple[0],
      channel: tuple[1],
      target: tuple[2],
      lun: tuple[3],
      vendor: vendorStr,
      model: modelStr,
      revision: revision || undefined,
      devicePath: devPath,
      sgDevicePath: sgPath,
      source: 'lsscsi',
    })
  }
  return drives
}

// ─── Parser dmesg (scsi device lines) ────────────────────────────────────────

export function parseDmesgScsiDevices(dmesg: string): KernelExposedLogicalDrive[] {
  const drives: KernelExposedLogicalDrive[] = []
  const seen = new Set<string>()

  for (const line of dmesg.split('\n')) {
    // Pattern: "scsi 0:2:0:0: Direct-Access     DELL     PERC H730P Mini  4.30 PQ: 0 ANSI: 5"
    const m = line.match(/scsi\s+([0-9:]+):\s+Direct-Access\s+(.+)/)
    if (!m) continue

    const scsiAddress = m[1]
    if (seen.has(scsiAddress)) continue
    seen.add(scsiAddress)

    const rest = m[2].trim()
    // Vendor = first word(s) up to 8 chars, model follows
    // Best effort: split on 2+ spaces
    const parts = rest.split(/\s{2,}/)
    const vendor = (parts[0] ?? '').trim()
    const model = (parts[1] ?? rest).trim()

    const modelLower = (vendor + ' ' + model).toLowerCase()
    if (!modelLower.includes('perc') && !modelLower.includes('megaraid') && !modelLower.includes('dell') && !modelLower.includes('lsi')) {
      continue
    }

    drives.push({
      id: `scsi-${scsiAddress}`,
      scsiAddress,
      hctl: scsiAddress,
      host: Number.parseInt(scsiAddress.split(':')[0] ?? '0', 10),
      channel: Number.parseInt(scsiAddress.split(':')[1] ?? '0', 10),
      target: Number.parseInt(scsiAddress.split(':')[2] ?? '0', 10),
      lun: Number.parseInt(scsiAddress.split(':')[3] ?? '0', 10),
      vendor,
      model,
      source: 'dmesg',
    })
  }
  return drives
}

// ─── Parser /proc/scsi/scsi ──────────────────────────────────────────────────

export function parseProcScsi(output: string): KernelExposedLogicalDrive[] {
  const drives: KernelExposedLogicalDrive[] = []
  // Lines: "Host: scsi0 Channel: 02 Id: 00 Lun: 00"
  //        "  Vendor: DELL     Model: PERC H730P Mini Rev: 4.30"
  //        "  Type:   Direct-Access"
  const hostRe = /Host:\s+scsi(\d+)\s+Channel:\s+(\d+)\s+Id:\s+(\d+)\s+Lun:\s+(\d+)/i
  const vendorRe = /Vendor:\s*(\S+.*?)\s+Model:\s*(.+?)\s+Rev:\s*(\S+)/i
  const typeRe = /Type:\s+Direct-Access/i

  const lines = output.split('\n')
  let current: { addr: string } | null = null

  for (const line of lines) {
    const hm = line.match(hostRe)
    if (hm) {
      current = { addr: `${hm[1]}:${hm[2]}:${hm[3]}:${hm[4]}` }
      continue
    }
    if (!current) continue

    const vm = line.match(vendorRe)
    if (vm && typeRe.test(lines[lines.indexOf(line) + 1] ?? '')) {
      const vendor = vm[1].trim()
      const model = vm[2].trim()
      const modelLower = (vendor + ' ' + model).toLowerCase()
      if (modelLower.includes('perc') || modelLower.includes('megaraid') || modelLower.includes('dell') || modelLower.includes('lsi')) {
        drives.push({
          id: `scsi-${current.addr}`,
          scsiAddress: current.addr,
          hctl: current.addr,
          host: Number.parseInt(current.addr.split(':')[0] ?? '0', 10),
          channel: Number.parseInt(current.addr.split(':')[1] ?? '0', 10),
          target: Number.parseInt(current.addr.split(':')[2] ?? '0', 10),
          lun: Number.parseInt(current.addr.split(':')[3] ?? '0', 10),
          vendor,
          model,
          revision: vm[3],
          source: 'proc_scsi',
        })
      }
      current = null
    }
  }
  return drives
}

// ─── Parser lsmod / dmesg pour drivers ───────────────────────────────────────

export function parseDriversFromLsmod(lsmodOutput: string, dmesgOutput: string): Record<string, string> {
  const drivers: Record<string, string> = {}

  // From dmesg: "megaraid_sas 0000:02:00.0: ..."
  for (const line of dmesgOutput.split('\n')) {
    const m = line.match(/^(megaraid_sas|aacraid|mpt3sas|hpsa|cciss|3w-sas)\s+(?:0000:)?([0-9a-f]{2}:[0-9a-f]{2}\.[0-9a-f])/i)
    if (m) {
      drivers[m[2]] = m[1].toLowerCase()
    }
  }

  // From dmesg: "scsi host0: Avago SAS based MegaRAID driver" → infer megaraid_sas if lsmod confirms
  const hasMegaraidInLsmod = /megaraid_sas/i.test(lsmodOutput)
  if (hasMegaraidInLsmod && /Avago SAS based MegaRAID driver/i.test(dmesgOutput)) {
    // We already have entries from above; this is a fallback for controllers with no PCI addr in dmesg
    if (Object.keys(drivers).length === 0) {
      drivers['__unknown__'] = 'megaraid_sas'
    }
  }

  return drivers
}

// ─── Détection du mode contrôleur (heuristique sans CLI) ────────────────────

/**
 * Infer RAID controller mode from kernel evidence (lsscsi, lsblk) when no
 * proprietary CLI (perccli/storcli) is available.
 *
 * Logic:
 *  - kernelLogicalDrives whose vendor/model mentions PERC/MegaRAID → virtual disks → raid
 *  - lsblk TYPE=disk with non-RAID-branded vendor/model → physical drives passed through → hba
 *  - Mix of both → mixed
 */
export function inferControllerMode(
  kernelLogicalDrives: KernelExposedLogicalDrive[],
  lsblkRaw: string,
): RaidControllerModeDetection {
  const evidence: string[] = []

  // PERC/MegaRAID virtual disks exposed as SCSI devices (already filtered by parseLsscsi)
  const percVirtual = kernelLogicalDrives.filter(ld => {
    const m = `${ld.vendor} ${ld.model}`.toLowerCase()
    return m.includes('perc') || m.includes('megaraid') || m.includes('virtual')
  })

  // Physical-looking block devices (lsblk, type=disk, model not PERC/MegaRAID/virtual)
  const physicalDrives: string[] = []
  for (const line of lsblkRaw.split('\n')) {
    const typeM  = line.match(/TYPE="([^"]+)"/)
    const vendorM = line.match(/VENDOR="([^"]*)"/)
    const modelM  = line.match(/MODEL="([^"]*)"/)
    if (typeM?.[1] !== 'disk') continue
    const label = `${vendorM?.[1] ?? ''} ${modelM?.[1] ?? ''}`.trim().toLowerCase()
    if (label.length === 0) continue
    if (!label.includes('perc') && !label.includes('megaraid') && !label.includes('virtual')) {
      physicalDrives.push(label)
    }
  }

  if (percVirtual.length > 0) {
    evidence.push(`${percVirtual.length} volume(s) virtuel(s) PERC/MegaRAID détecté(s) via lsscsi/dmesg`)
  }
  if (physicalDrives.length > 0) {
    const examples = physicalDrives.slice(0, 3).join(', ')
    evidence.push(`${physicalDrives.length} disque(s) physique(s) exposé(s) directement : ${examples}`)
  }

  if (percVirtual.length > 0 && physicalDrives.length === 0) {
    evidence.push('Source : kernel (lsscsi/dmesg/lsblk) — confiance moyenne')
    return { mode: 'raid', confidence: 'medium', evidence }
  }
  if (physicalDrives.length >= 2 && percVirtual.length === 0) {
    evidence.push('Source : kernel (lsblk) — confiance faible (aucun volume virtuel PERC visible)')
    return { mode: 'hba', confidence: 'low', evidence }
  }
  if (percVirtual.length > 0 && physicalDrives.length > 0) {
    evidence.push('Source : kernel (lsscsi/lsblk) — confiance faible')
    return { mode: 'mixed', confidence: 'low', evidence }
  }

  evidence.push('Aucun périphérique SCSI RAID ni disque physique identifié — installez perccli/storcli pour le mode exact')
  return { mode: 'unknown', confidence: 'low', evidence }
}

// ─── Merge : PCI + SCSI logical drives → HardwareRaidController ──────────────

export function buildReadOnlyControllers(
  pciCandidates: PciRaidCandidate[],
  kernelLogicalDrives: KernelExposedLogicalDrive[],
  drivers: Record<string, string>,
  dmesgRaw: string,
  lsblkRaw = '',
): HardwareRaidController[] {
  return pciCandidates.map((pci, idx) => {
    const driver = drivers[pci.pciAddress]
      ?? inferDriverFromDmesg(dmesgRaw, pci.vendor)

    // Associate SCSI logical drives that are likely from this PCI controller.
    // If there's only one PCI controller, all SCSI RAID drives belong to it.
    const relatedLDs = pciCandidates.length === 1
      ? kernelLogicalDrives
      : kernelLogicalDrives.filter(ld => isLikelyRelated(ld, pci, dmesgRaw))

    const logicalDrives: HardwareRaidLogicalDrive[] = relatedLDs.map((ld, i) =>
      toReadOnlyLogicalDrive(ld, `pci-${pci.pciAddress}`, i),
    )

    const detectionSource: HardwareRaidController['detectionSource'] = ['lspci']
    if (relatedLDs.some(ld => ld.source === 'lsscsi')) detectionSource.push('lsscsi')
    if (relatedLDs.some(ld => ld.source === 'dmesg') || dmesgRaw.includes(pci.pciAddress)) detectionSource.push('dmesg')

    // Build lsscsi evidence string for model enrichment
    const lsscsiEvidence = relatedLDs.map(ld => `${ld.vendor} ${ld.model}`).join('\n')

    return {
      id: `pci-${pci.pciAddress}-${idx}`,
      vendor: pci.vendor,
      model: normalizeModel(pci, dmesgRaw, lsscsiEvidence),
      driver,
      pciAddress: pci.pciAddress,
      pciRawLine: pci.rawLine,
      cliTool: 'none',
      cliPath: undefined,
      detectionSource,
      managementMode: 'read_only_limited',
      health: 'unknown' as RaidHealth,
      controllerMode: inferControllerMode(relatedLDs, lsblkRaw),
      supportsCreate: false,
      supportsDelete: false,
      supportsHotSpare: false,
      physicalDrives: [],
      logicalDrives,
      warnings: [
        'Contrôleur RAID détecté par le kernel, mais StorCLI/PercCLI n\'est pas inclus dans cette installation ESOS.',
        'Ces outils doivent être sélectionnés lors de l\'installation ESOS sur la clé USB (script esos_install), ou ajoutés manuellement via archivemount sur l\'image cpio (PRIMARY-root.cpio.bz2).',
      ],
    }
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toReadOnlyLogicalDrive(
  ld: KernelExposedLogicalDrive,
  controllerId: string,
  index: number,
): HardwareRaidLogicalDrive {
  const idx = ld.scsiAddress.split(':')
  const diskNum = parseInt(idx[2] ?? '0', 10)
  return {
    controllerId,
    id: ld.id,
    name: `${ld.vendor.trim()} ${ld.model.trim()} logical disk ${diskNum}`,
    raidLevel: 'unknown',
    sizeBytes: undefined,
    state: 'unknown',
    scsiAddress: ld.scsiAddress,
    scsiModel: `${ld.vendor.trim()} ${ld.model.trim()}`.trim(),
    devicePath: ld.devicePath,
    detectionSource: ld.source === 'lsscsi' ? 'lsscsi' : ld.source === 'dmesg' ? 'dmesg' : 'proc_scsi',
    warnings: ['Niveau RAID et état détaillé indisponibles sans perccli/storcli.'],
  }
}

function isLikelyRelated(ld: KernelExposedLogicalDrive, pci: PciRaidCandidate, dmesg: string): boolean {
  // Check if dmesg links the SCSI address to the PCI address
  const dmesgLine = dmesg.split('\n').find(l => l.includes(ld.scsiAddress))
  if (dmesgLine && dmesgLine.includes(pci.pciAddress)) return true
  return false
}

function inferDriverFromDmesg(dmesg: string, vendor: RaidVendor): string | undefined {
  if (/megaraid_sas|Avago SAS based MegaRAID driver/i.test(dmesg)) return 'megaraid_sas'
  if (/aacraid/i.test(dmesg)) return 'aacraid'
  if (/mpt3sas/i.test(dmesg)) return 'mpt3sas'
  if (/hpsa/i.test(dmesg)) return 'hpsa'
  return undefined
}

function normalizeModel(pci: PciRaidCandidate, dmesg: string, lsscsiEvidence = ''): string {
  // Already fully enriched via PCI ID mapping (e.g. H730P Mini)
  if (pci.model.includes('H730P')) return pci.model

  if (pci.vendor === 'dell_perc' || pci.vendor === 'lsi_megaraid') {
    // Build combined evidence from PCI raw line + dmesg + lsscsi for model identification
    const evidence = `${pci.rawLine}\n${dmesg}\n${lsscsiEvidence}`.toLowerCase()

    if (
      evidence.includes('perc h730p mini') ||
      evidence.includes('(0x1000)/(0x005d)/(0x1028)/(0x1f47)')
    ) {
      return 'Dell PERC H730P Mini / LSI MegaRAID SAS-3 3108 [Invader]'
    }
    if (evidence.includes('perc h730')) {
      return `Dell PERC H730 / ${pci.model}`
    }
    if (evidence.includes('perc h710')) {
      return `Dell PERC H710 / ${pci.model}`
    }

    // Generic: enrich from dmesg PERC model string
    const dmesgPerc = dmesg.match(/DELL\s+(PERC\s+\S+(?:\s+\w+)?)/i)?.[1]
    if (dmesgPerc) {
      return `${dmesgPerc} / ${pci.model}`
    }
  }
  return pci.model
}

function deduplicateLogicalDrives(): (ld: KernelExposedLogicalDrive, i: number, arr: KernelExposedLogicalDrive[]) => boolean {
  const seen = new Set<string>()
  return (ld) => {
    if (seen.has(ld.id)) return false
    seen.add(ld.id)
    return true
  }
}

function splitKernelSections(output: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const lines = output.split('\n')
  let current = ''
  const buf: string[] = []

  for (const line of lines) {
    const m = line.match(/^===([A-Z_]+)===/)
    if (m) {
      if (current) sections[current] = buf.join('\n')
      current = m[1]
      buf.length = 0
    } else {
      buf.push(line)
    }
  }
  if (current) sections[current] = buf.join('\n')
  return sections
}
