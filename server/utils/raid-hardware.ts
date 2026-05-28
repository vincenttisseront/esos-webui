/**
 * Découverte des contrôleurs RAID hardware (SDD v3.12.1 §6).
 * Priorité : storcli (JSON) > perccli (JSON) > MegaCli64 (texte) > arcconf.
 * Fallback : lspci + lsscsi + dmesg si aucun outil CLI disponible.
 */
import type {
  SSHSessionManager,
} from './ssh-session-manager'
import type {
  HardwareRaidController, HardwareRaidPhysicalDrive, HardwareRaidLogicalDrive,
  RaidToolsInfo, RaidVendor, RaidHealth, RaidControllerModeDetection,
} from './raid-types'
import {
  collectKernelRaidInfo,
  buildReadOnlyControllers,
  type PciRaidCandidate,
} from './raid-pci-detection'
import { resolveRaidCliExecutable, validateRaidCliExecutable } from './raid-cli-runtime'
import { extractStorCliJsonPayload, inferRaidCliTool, storCliJsonHasControllers } from '../../utils/raid-cli-path'
import { buildHwCliCreateLd } from '../../utils/raid-hw-cli-create'
import { countFreeHwRaidDisks } from '../../utils/raid-hw-create-eligibility'

// ─── Point d'entrée ──────────────────────────────────────────────────────────

export async function discoverHardwareControllers(
  manager: SSHSessionManager,
  tools: RaidToolsInfo,
  resolvedCli?: string | null,
  kernelInfo?: Awaited<ReturnType<typeof collectKernelRaidInfo>>,
): Promise<HardwareRaidController[]> {
  const cliControllers: HardwareRaidController[] = []

  if (tools.storcli || tools.perccli) {
    const executableCli = await resolveRaidCliExecutable(manager, resolvedCli)
    if (executableCli) {
      const validation = await validateRaidCliExecutable(manager, executableCli)
      if (validation.ok) {
        cliControllers.push(...await tryStorCliDiscovery(manager, executableCli))
      }
    }
  } else if (tools.MegaCli64) {
    cliControllers.push(...await tryMegaCliDiscovery(manager))
  }

  if (tools.arcconf) {
    cliControllers.push(...await tryArcconfDiscovery(manager))
  }

  // Mark all CLI-discovered controllers as fully managed; gate create on free disks
  for (const ctrl of cliControllers) {
    ctrl.managementMode = 'full'
    ctrl.detectionSource = ['cli']
    ctrl.warnings = []
    const freeDisks = countFreeHwRaidDisks(ctrl)
    ctrl.supportsCreate = freeDisks > 0
    if (freeDisks === 0) {
      ctrl.warnings.push('Aucun disque physique libre (UGood) pour créer un volume.')
    }
  }

  // Merge with PCI-detected controllers (add read-only ones not found by CLI)
  const ki = kernelInfo ?? await collectKernelRaidInfo(manager)
  const pciControllers = buildReadOnlyControllers(
    ki.pciCandidates,
    ki.kernelLogicalDrives,
    ki.drivers,
    ki.dmesgRaw,
    ki.lsblkRaw,
  )

  const merged = [...cliControllers]

  for (const pci of pciControllers) {
    // Check if a CLI controller already covers this PCI address
    const alreadyCovered = cliControllers.some(
      ctrl => ctrl.pciAddress && ctrl.pciAddress === pci.pciAddress,
    )
    if (alreadyCovered) continue

    // If no PCI address from CLI, check if model overlaps (heuristic)
    const modelOverlap = cliControllers.some(
      ctrl => pci.model && ctrl.model && (
        ctrl.model.toLowerCase().includes(extractKeyword(pci.model)) ||
        pci.model.toLowerCase().includes(extractKeyword(ctrl.model))
      ),
    )
    if (modelOverlap) continue

    merged.push(pci)
  }

  return merged
}

function extractKeyword(model: string): string {
  // Extract a distinctive keyword from model name for overlap detection
  const m = model.match(/(?:H\d{3}\w+|MegaRAID\s+SAS[\w-]+|RAID\s+\d+\w+)/i)
  return (m?.[0] ?? model.split(' ').slice(0, 2).join(' ')).toLowerCase()
}

// ─── StorCLI / PercCLI (JSON) ────────────────────────────────────────────────

async function tryStorCliDiscovery(
  manager: SSHSessionManager,
  cli: string,
): Promise<HardwareRaidController[]> {
  const q = cli.replace(/'/g, `'\\''`)
  try {
    const { stdout } = await manager.exec(`${q} /call show all J 2>/dev/null`, 45_000)
    const parsed = parseStorCliJson(stdout, cli)
    if (parsed.length) return parsed
  } catch { /* try lighter command */ }
  try {
    const { stdout } = await manager.exec(`${q} /call show J 2>/dev/null`, 30_000)
    return parseStorCliJson(stdout, cli)
  } catch {
    return []
  }
}

function parseStorCliJson(json: string, cli: string): HardwareRaidController[] {
  const controllers: HardwareRaidController[] = []
  const payload = extractStorCliJsonPayload(json)
  if (!storCliJsonHasControllers(payload) && !payload.includes('Response Data')) {
    return controllers
  }
  try {
    const data = JSON.parse(payload) as { Controllers?: unknown[]; controllers?: unknown[] }
    const clist: unknown[] = data?.Controllers ?? data?.controllers ?? []

    for (const c of clist) {
      const cObj = c as Record<string, unknown>
      const responseData = (cObj['Response Data'] ?? {}) as Record<string, unknown>
      const basics = (responseData['Basics'] ?? {}) as Record<string, unknown>
      const status = (responseData['Status'] ?? {}) as Record<string, unknown>

      const ctrlIndex = String(basics['Controller'] ?? controllers.length)
      const model = String(basics['Model'] ?? 'Unknown')
      const serial = String(basics['Serial Number'] ?? '')
      const firmware = String(basics['FW Version'] ?? '')

      const ctrlStatus = String(status['Controller Status'] ?? 'Unknown').toLowerCase()
      const health: RaidHealth = ctrlStatus === 'optimal' ? 'ok'
        : ctrlStatus.includes('degraded') ? 'critical'
        : 'unknown'

      // Physical drives
      const pdList = (responseData['PD LIST'] ?? []) as Array<Record<string, unknown>>
      const physicalDrives: HardwareRaidPhysicalDrive[] = pdList.map(pd => {
        const eid = String(pd['EID:Slt'] ?? '').split(':')
        const stateStr = String(pd['State'] ?? 'Onln').toLowerCase()
        const sizeStr = String(pd['Size'] ?? '0')
        const sizeBytes = parseStorCliSize(sizeStr)
        const mediaType = String(pd['Med'] ?? 'HDD') as 'HDD' | 'SSD' | 'NVMe'

        const state = mapStorCliPdState(stateStr)
        const eligible = state === 'unconfigured_good'

        return {
          controllerId: ctrlIndex,
          enclosure: eid[0],
          slot: eid[1] ?? eid[0],
          state,
          sizeBytes,
          mediaType,
          model: String(pd['Model'] ?? ''),
          interfaceType: String(pd['Intf'] ?? ''),
          eligible,
          warnings: state === 'failed' ? ['Disque en échec'] : [],
        }
      })

      // Virtual drives / logical drives
      const vdList = (responseData['VD LIST'] ?? []) as Array<Record<string, unknown>>
      const logicalDrives: HardwareRaidLogicalDrive[] = vdList.map((vd, idx) => {
        const raidLevel = String(vd['TYPE'] ?? 'raid0').replace(/raid/i, '') as HardwareRaidLogicalDrive['raidLevel']
        const sizeStr = String(vd['Size'] ?? '0')
        const sizeBytes = parseStorCliSize(sizeStr)
        const stateStr = String(vd['State'] ?? 'Optl').toLowerCase()

        const osDrive = String(vd['OS Drive Name'] ?? vd['OS Drive Letter'] ?? '').trim()
        const wwn = String(
          vd['WWN'] ?? vd['SCSI NAA ID'] ?? vd['SCSI NAA Id'] ?? '',
        ).trim()
        const inquiry = String(vd['Inquiry Data'] ?? vd['Inquiry'] ?? '').trim()

        return {
          controllerId: ctrlIndex,
          id: parseStorCliLogicalDriveId(ctrlIndex, vd, idx),
          raidLevel,
          sizeBytes,
          state: mapStorCliVdState(stateStr),
          cachePolicy: String(vd['Cache'] ?? ''),
          readPolicy: String(vd['sCC'] ?? ''),
          writePolicy: String(vd['Cache'] ?? '').includes('WB') ? 'WB' : 'WT',
          devicePath: osDrive,
          wwn: wwn || undefined,
          inquiry: inquiry || undefined,
        }
      })

      const vendor: RaidVendor = inferRaidCliTool(cli) === 'perccli' ? 'dell_perc' : 'lsi_megaraid'
      const controllerMode = extractStorCliControllerMode(responseData, pdList, vdList)
      const cliTool = inferRaidCliTool(cli)

      controllers.push({
        id: ctrlIndex,
        vendor,
        model,
        serial,
        firmware,
        cliTool,
        cliPath: cli,
        detectionSource: ['cli'],
        managementMode: 'full',
        health,
        controllerMode,
        supportsCreate: true,
        supportsDelete: true,
        supportsHotSpare: true,
        physicalDrives,
        logicalDrives: logicalDrives.map(ld => ({ ...ld, detectionSource: 'cli' as const })),
        warnings: [],
      })
    }
  } catch { /* JSON invalide */ }
  return controllers
}

// ─── StorCLI / PercCLI : détection mode contrôleur ────────────────────────

function extractStorCliControllerMode(
  responseData: Record<string, unknown>,
  pdList: Array<Record<string, unknown>>,
  vdList: Array<Record<string, unknown>>,
): RaidControllerModeDetection {
  const evidence: string[] = []
  const status  = (responseData['Status']  ?? {}) as Record<string, unknown>
  const support  = (responseData['Support']  ?? {}) as Record<string, unknown>
  const basics   = (responseData['Basics']   ?? {}) as Record<string, unknown>

  // 1. Direct controller mode field (highest confidence)
  const ctrlModeRaw = String(status['Controller Mode'] ?? '').trim()
  const personalityRaw = String(
    basics['Personality'] ?? basics['Current Personality'] ?? '',
  ).trim()
  const directMode = (ctrlModeRaw || personalityRaw).toUpperCase()

  // 2. Capabilities / Support section — extra precision
  const capabilities = (responseData['Capabilities'] ?? {}) as Record<string, unknown>
  const jbodSupportRaw = String(
    support['Enable JBOD'] ?? support['Enable JBod'] ??
    capabilities['Enable JBOD'] ?? capabilities['Enable JBod'] ?? '',
  ).toLowerCase().trim()
  const jbodEnabled = jbodSupportRaw === 'yes' || jbodSupportRaw === 'enabled'
  const jbodDisabled = jbodSupportRaw === 'no'  || jbodSupportRaw === 'disabled'

  // RAID levels listed in capabilities → confirms RAID-capable mode
  const raidLevelsCap = String(
    capabilities['RAID Level Supported'] ?? capabilities['Supported RAID Levels'] ?? '',
  ).trim()
  const hasRaidCapabilities = raidLevelsCap.length > 0

  if (directMode.includes('HBA')) {
    evidence.push(`Champ Controller Mode / Personality : ${ctrlModeRaw || personalityRaw}`)
    if (jbodEnabled) evidence.push('JBOD activé')
    evidence.push('Source : perccli/storcli — confiance haute')
    return { mode: 'hba', confidence: 'high', evidence }
  }
  if (directMode.includes('RAID')) {
    evidence.push(`Champ Controller Mode / Personality : ${ctrlModeRaw || personalityRaw}`)
    if (vdList.length > 0) evidence.push(`${vdList.length} volume(s) virtuel(s) configuré(s)`)
    evidence.push('Source : perccli/storcli — confiance haute')
    return { mode: 'raid', confidence: 'high', evidence }
  }

  // 3. Infer from physical drive states and virtual drive count
  const jbodPds = pdList.filter(pd => {
    const st = String(pd['State'] ?? '').toLowerCase()
    return st === 'jbod' || st === 'non-raid' || st === 'nonraid'
  }).length
  const onlinePds = pdList.filter(pd => {
    const st = String(pd['State'] ?? '').toLowerCase()
    return st === 'onln' || st === 'online'
  }).length
  const vdCount = vdList.length

  if (vdCount > 0 && onlinePds > 0) {
    evidence.push(`${vdCount} volume(s) virtuel(s), ${onlinePds} disque(s) en ligne`)
    if (jbodPds > 0) {
      evidence.push(`${jbodPds} disque(s) JBOD/Non-RAID`)
      evidence.push('Source : perccli/storcli — confiance moyenne')
      return { mode: 'mixed', confidence: 'medium', evidence }
    }
    // No JBOD disks + JBOD explicitly disabled → high confidence RAID
    if (jbodDisabled) {
      evidence.push('JBOD désactivé sur le contrôleur')
      if (hasRaidCapabilities) evidence.push(`Niveaux RAID supportés : ${raidLevelsCap}`)
      evidence.push('Source : perccli/storcli — confiance haute')
      return { mode: 'raid', confidence: 'high', evidence }
    }
    // RAID levels advertised in capabilities → elevated confidence
    if (hasRaidCapabilities) {
      evidence.push(`Niveaux RAID supportés : ${raidLevelsCap}`)
      evidence.push('Source : perccli/storcli — confiance haute')
      return { mode: 'raid', confidence: 'high', evidence }
    }
    evidence.push('Source : perccli/storcli — confiance moyenne')
    return { mode: 'raid', confidence: 'medium', evidence }
  }
  if (vdCount === 0 && jbodPds >= 1) {
    evidence.push(`${jbodPds} disque(s) JBOD/Non-RAID, aucun volume virtuel`)
    if (jbodEnabled) {
      evidence.push('JBOD activé sur le contrôleur')
      evidence.push('Source : perccli/storcli — confiance haute')
      return { mode: 'hba', confidence: 'high', evidence }
    }
    evidence.push('Source : perccli/storcli — confiance moyenne')
    return { mode: 'hba', confidence: 'medium', evidence }
  }

  evidence.push('Mode contrôleur non déterminable depuis les données CLI disponibles')
  return { mode: 'unknown', confidence: 'low', evidence }
}

/** Stable LD id from storcli/perccli VD LIST row (DG/VD preferred over array index). */
export function parseStorCliLogicalDriveId(
  ctrlIndex: string,
  vd: Record<string, unknown>,
  fallbackIdx: number,
): string {
  const dgVd = String(vd['DG/VD'] ?? vd['DG-VD'] ?? vd['DG_VD'] ?? '').trim()
  const dgMatch = dgVd.match(/^(\d+)\/(\d+)$/)
  if (dgMatch) return `${dgMatch[1]}/vd${dgMatch[2]}`

  const vdField = String(vd['VD'] ?? vd['VD ID'] ?? vd['VDID'] ?? '').trim()
  const vdNum = vdField.match(/(\d+)\s*$/)?.[1]
  if (vdNum) return `${ctrlIndex}/vd${vdNum}`

  return `${ctrlIndex}/vd${fallbackIdx}`
}

function parseStorCliSize(s: string): number {
  const m = s.match(/([\d.]+)\s*(TB|GB|MB)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  if (unit === 'TB') return Math.round(n * 1e12)
  if (unit === 'GB') return Math.round(n * 1e9)
  if (unit === 'MB') return Math.round(n * 1e6)
  return 0
}

function mapStorCliPdState(s: string): HardwareRaidPhysicalDrive['state'] {
  if (s === 'ugood' || s === 'unconfigured(good)' || s === 'ugd') return 'unconfigured_good'
  if (s === 'onln' || s === 'online') return 'online'
  if (s === 'dhs' || s === 'dedicated hot spare' || s === 'ghs') return 'hotspare'
  if (s === 'failed' || s === 'fld') return 'failed'
  if (s === 'rbld' || s === 'rebuild') return 'rebuild'
  if (s === 'foreign') return 'foreign'
  return 'unknown'
}

function mapStorCliVdState(s: string): HardwareRaidLogicalDrive['state'] {
  if (s === 'optl' || s === 'optimal') return 'optimal'
  if (s === 'dgrd' || s === 'degraded') return 'degraded'
  if (s === 'rbld' || s === 'rebuilding') return 'rebuilding'
  if (s === 'failed') return 'failed'
  if (s === 'offline') return 'offline'
  return 'unknown'
}

// ─── MegaCLI fallback texte ──────────────────────────────────────────────────

async function tryMegaCliDiscovery(manager: SSHSessionManager): Promise<HardwareRaidController[]> {
  try {
    const cmd = [
      'echo "===MEGACLI_ADPINFO==="; MegaCli64 -AdpAllInfo -aAll 2>/dev/null || echo ""',
      'echo "===MEGACLI_PDLIST==="; MegaCli64 -PDList -aAll 2>/dev/null || echo ""',
      'echo "===MEGACLI_LDINFO==="; MegaCli64 -LDInfo -Lall -aAll 2>/dev/null || echo ""',
    ].join('\n')

    const { stdout } = await manager.exec(cmd, 30_000)
    return parseMegaCliText(stdout)
  } catch {
    return []
  }
}

function parseMegaCliText(output: string): HardwareRaidController[] {
  const controllers: HardwareRaidController[] = []
  const parts = output.split(/===MEGACLI_ADPINFO===/)

  for (let i = 1; i < parts.length; i++) {
    const section = parts[i] ?? ''
    const model = section.match(/Product Name\s*:\s*(.+)/)?.[1]?.trim() ?? 'MegaRAID'
    const serial = section.match(/Serial No\s*:\s*(.+)/)?.[1]?.trim()
    const firmware = section.match(/FW Package Build\s*:\s*(.+)/)?.[1]?.trim()

    controllers.push({
      id: String(i - 1),
      vendor: 'lsi_megaraid',
      model,
      serial,
      firmware,
      cliTool: 'MegaCli64',
      cliPath: 'MegaCli64',
      detectionSource: ['cli'],
      managementMode: 'full',
      health: 'unknown',
      controllerMode: inferMegaCliControllerMode(output),
      supportsCreate: true,
      supportsDelete: true,
      supportsHotSpare: true,
      physicalDrives: parseMegaCliPDs(output, String(i - 1)),
      logicalDrives: parseMegaCliLDs(output, String(i - 1)),
      warnings: [],
    })
  }

  return controllers
}

function parseMegaCliPDs(output: string, ctrlId: string): HardwareRaidPhysicalDrive[] {
  const drives: HardwareRaidPhysicalDrive[] = []
  const sections = output.split(/Enclosure Device ID/)
  for (let i = 1; i < sections.length; i++) {
    const s = sections[i]
    const enc = s.match(/:\s*(\d+)/)?.[1]
    const slot = s.match(/Slot Number\s*:\s*(\d+)/)?.[1] ?? String(i - 1)
    const state = s.match(/Firmware state\s*:\s*(.+)/)?.[1]?.trim().toLowerCase() ?? 'unknown'
    const sizeStr = s.match(/Raw Size\s*:\s*(.+)/)?.[1]?.trim() ?? ''
    const model = s.match(/Inquiry Data\s*:\s*(.+)/)?.[1]?.trim()
    const mediaStr = s.match(/Media Type\s*:\s*(.+)/)?.[1]?.trim() ?? 'HDD'
    const mediaType: HardwareRaidPhysicalDrive['mediaType'] = mediaStr.includes('SSD') ? 'SSD' : 'HDD'

    const sizeBytes = parseMegaCliSize(sizeStr)
    const pdState = mapMegaCliPdState(state)

    drives.push({
      controllerId: ctrlId,
      enclosure: enc,
      slot,
      state: pdState,
      sizeBytes,
      mediaType,
      model,
      eligible: pdState === 'unconfigured_good',
      warnings: pdState === 'failed' ? ['Disque en échec'] : [],
    })
  }
  return drives
}

function parseMegaCliLDs(output: string, ctrlId: string): HardwareRaidLogicalDrive[] {
  const drives: HardwareRaidLogicalDrive[] = []
  const sections = output.split(/Virtual Drive\s*:\s*(\d+)/)
  for (let i = 1; i < sections.length; i += 2) {
    const id = sections[i]
    const s = sections[i + 1] ?? ''
    const raidLvl = s.match(/RAID Level\s*:\s*Primary-(\d+)/)?.[1] ?? 'unknown'
    const sizeStr = s.match(/Size\s*:\s*(.+)/)?.[1]?.trim() ?? ''
    const stateStr = s.match(/State\s*:\s*(\w+)/)?.[1]?.trim().toLowerCase() ?? 'unknown'
    const sizeBytes = parseMegaCliSize(sizeStr)

    drives.push({
      controllerId: ctrlId,
      id: `${ctrlId}/ld${id}`,
      raidLevel: raidLvl as HardwareRaidLogicalDrive['raidLevel'],
      sizeBytes,
      state: mapMegaCliVdState(stateStr),
    })
  }
  return drives
}

function inferMegaCliControllerMode(output: string): RaidControllerModeDetection {
  const evidence: string[] = []
  const ldCount = (output.match(/Virtual Drive\s*:/g) ?? []).length
  const jbodLines = (output.match(/Firmware state\s*:.*Non-RAID/gi) ?? []).length

  if (ldCount > 0 && jbodLines === 0) {
    evidence.push(`${ldCount} volume(s) virtuel(s) détecté(s) via MegaCLI`)
    evidence.push('Source : MegaCli64 — confiance moyenne')
    return { mode: 'raid', confidence: 'medium', evidence }
  }
  if (ldCount > 0 && jbodLines > 0) {
    evidence.push(`${ldCount} volume(s) virtuel(s) et ${jbodLines} disque(s) Non-RAID`)
    evidence.push('Source : MegaCli64 — confiance moyenne')
    return { mode: 'mixed', confidence: 'medium', evidence }
  }
  if (jbodLines > 0) {
    evidence.push(`${jbodLines} disque(s) Non-RAID, aucun volume virtuel`)
    evidence.push('Source : MegaCli64 — confiance moyenne')
    return { mode: 'hba', confidence: 'medium', evidence }
  }

  evidence.push('Mode contrôleur non déterminable depuis MegaCLI')
  return { mode: 'unknown', confidence: 'low', evidence }
}

function parseMegaCliSize(s: string): number {
  const m = s.match(/([\d.]+)\s*(TB|GB|MB)/i)
  if (!m) return 0
  const n = parseFloat(m[1])
  const unit = m[2].toUpperCase()
  if (unit === 'TB') return Math.round(n * 1e12)
  if (unit === 'GB') return Math.round(n * 1e9)
  if (unit === 'MB') return Math.round(n * 1e6)
  return 0
}

function mapMegaCliPdState(s: string): HardwareRaidPhysicalDrive['state'] {
  if (s.includes('unconfigured(good)')) return 'unconfigured_good'
  if (s.includes('online')) return 'online'
  if (s.includes('hot spare')) return 'hotspare'
  if (s.includes('failed') || s.includes('offline')) return 'failed'
  if (s.includes('rebuild')) return 'rebuild'
  if (s.includes('foreign')) return 'foreign'
  return 'unknown'
}

function mapMegaCliVdState(s: string): HardwareRaidLogicalDrive['state'] {
  if (s === 'optimal') return 'optimal'
  if (s === 'degraded') return 'degraded'
  if (s === 'rebuilding') return 'rebuilding'
  if (s === 'failed') return 'failed'
  if (s === 'offline') return 'offline'
  return 'unknown'
}

// ─── Adaptec arcconf ──────────────────────────────────────────────────────────

async function tryArcconfDiscovery(manager: SSHSessionManager): Promise<HardwareRaidController[]> {
  try {
    const { stdout: listOut } = await manager.exec('arcconf LIST 2>/dev/null', 15_000)
    const controllerNumbers = parseArcconfControllerList(listOut)

    const controllers: HardwareRaidController[] = []
    for (const num of controllerNumbers) {
      try {
        const { stdout } = await manager.exec(`arcconf GETCONFIG ${num} 2>/dev/null`, 20_000)
        const ctrl = parseArcconfConfig(stdout, String(num))
        controllers.push(ctrl)
      } catch { /* continue */ }
    }
    return controllers
  } catch {
    return []
  }
}

function parseArcconfControllerList(output: string): number[] {
  const nums: number[] = []
  for (const line of output.split('\n')) {
    const m = line.match(/Controller\s+(\d+)/i)
    if (m) nums.push(parseInt(m[1], 10))
  }
  if (nums.length === 0) nums.push(1) // défaut arcconf : controller 1
  return nums
}

function parseArcconfConfig(output: string, ctrlId: string): HardwareRaidController {
  const model = output.match(/Controller Model\s*:\s*(.+)/)?.[1]?.trim() ?? 'Adaptec'
  const serial = output.match(/Controller Serial Number\s*:\s*(.+)/)?.[1]?.trim()
  const firmware = output.match(/Firmware Version\s*:\s*(.+)/)?.[1]?.trim()
  const statusStr = output.match(/Controller Status\s*:\s*(\w+)/)?.[1]?.toLowerCase() ?? 'ok'

  const health: RaidHealth = statusStr === 'optimal' || statusStr === 'ok' ? 'ok'
    : statusStr.includes('degraded') ? 'critical'
    : 'unknown'

  // Physical devices
  const physicalDrives: HardwareRaidPhysicalDrive[] = []
  const pdSections = output.split(/Device #\d+/)
  for (let i = 1; i < pdSections.length; i++) {
    const s = pdSections[i]
    const stateStr = s.match(/State\s*:\s*(\w+)/)?.[1]?.toLowerCase() ?? 'unknown'
    const sizeStr = s.match(/Total Size\s*:\s*(.+)/)?.[1]?.trim() ?? ''
    const chanStr = s.match(/Channel #(\d+)/)?.[1] ?? String(i - 1)
    const devStr = s.match(/Device #(\d+)/)?.[1] ?? String(i - 1)
    const model = s.match(/Model\s*:\s*(.+)/)?.[1]?.trim()
    const sizeBytes = parseMegaCliSize(sizeStr)

    const state: HardwareRaidPhysicalDrive['state'] = stateStr === 'ready' ? 'unconfigured_good'
      : stateStr === 'online' ? 'online'
      : stateStr === 'failed' || stateStr === 'dead' ? 'failed'
      : 'unknown'

    physicalDrives.push({
      controllerId: ctrlId,
      enclosure: chanStr,
      slot: devStr,
      state,
      sizeBytes,
      model,
      eligible: state === 'unconfigured_good',
      warnings: state === 'failed' ? ['Disque en échec'] : [],
    })
  }

  // Logical devices
  const logicalDrives: HardwareRaidLogicalDrive[] = []
  const ldSections = output.split(/Logical Device number \d+/)
  for (let i = 1; i < ldSections.length; i++) {
    const s = ldSections[i]
    const raidLevel = s.match(/RAID level\s*:\s*(\d+)/)?.[1] ?? 'unknown'
    const sizeStr = s.match(/Size\s*:\s*(\d+\s*MB)/)?.[1] ?? s.match(/Size\s*:\s*(.+)/)?.[1]?.trim() ?? ''
    const stateStr = s.match(/Status of Logical Device\s*:\s*(\w+)/)?.[1]?.toLowerCase() ?? 'unknown'
    const sizeBytes = parseMegaCliSize(sizeStr) || parseInt(sizeStr, 10) * 1024 * 1024

    logicalDrives.push({
      controllerId: ctrlId,
      id: `${ctrlId}/ld${i - 1}`,
      raidLevel: raidLevel as HardwareRaidLogicalDrive['raidLevel'],
      sizeBytes,
      state: stateStr === 'optimal' ? 'optimal'
        : stateStr === 'degraded' ? 'degraded'
        : 'unknown',
    })
  }

  return {
    id: ctrlId,
    vendor: 'adaptec_aacraid',
    model,
    serial,
    firmware,
    cliTool: 'arcconf',
    cliPath: 'arcconf',
    detectionSource: ['cli'],
    managementMode: 'full',
    health,
    controllerMode: inferArcconfControllerMode(output, logicalDrives.length),
    supportsCreate: true,
    supportsDelete: true,
    supportsHotSpare: false,
    physicalDrives,
    logicalDrives: logicalDrives.map(ld => ({ ...ld, detectionSource: 'cli' as const })),
    warnings: [],
  }
}

function inferArcconfControllerMode(
  output: string,
  vdCount: number,
): RaidControllerModeDetection {
  const evidence: string[] = []
  const modeMatch = output.match(/Controller Mode\s*:\s*(\w+)/i)?.[1] ?? ''

  if (modeMatch.toLowerCase().includes('hba')) {
    evidence.push(`Champ Controller Mode : ${modeMatch}`)
    evidence.push('Source : arcconf — confiance haute')
    return { mode: 'hba', confidence: 'high', evidence }
  }
  if (vdCount > 0) {
    evidence.push(`${vdCount} volume(s) logique(s) détecté(s) via arcconf`)
    evidence.push('Source : arcconf — confiance moyenne')
    return { mode: 'raid', confidence: 'medium', evidence }
  }

  evidence.push('Mode contrôleur non déterminable depuis arcconf')
  return { mode: 'unknown', confidence: 'low', evidence }
}

// ─── Générateurs de commandes (SDD §9) ───────────────────────────────────────

export function buildStorCliCreateLd(
  cli: string,
  ctrlIndex: string,
  raidLevel: string,
  drives: Array<{ enclosure?: string; slot: string }>,
  writePolicy: 'WT' | 'WB',
  readPolicy: 'NORA' | 'RA' | 'ADRA',
  cliTool?: 'perccli' | 'storcli',
): string {
  return buildHwCliCreateLd({
    cli,
    ctrlIndex,
    raidLevel,
    drives,
    writePolicy,
    readPolicy,
    flavor: cliTool,
    includeCachePolicies: cliTool === 'storcli',
    volumeName: undefined,
  })
}

export function buildMegaCliCreateLd(
  ctrlIndex: string,
  raidLevel: string,
  drives: Array<{ enclosure?: string; slot: string }>,
  writePolicy: 'WT' | 'WB',
  readPolicy: 'NORA' | 'RA' | 'ADRA',
): string {
  const driveStr = drives.map(d => `${d.enclosure ?? '8'}:${d.slot}`).join(',')
  return `MegaCli64 -CfgLDAdd -R${raidLevel}[${driveStr}] ${writePolicy} ${readPolicy} -a${ctrlIndex}`
}

export function buildArcconfCreateLd(
  ctrlNum: string,
  raidLevel: string,
  drives: Array<{ enclosure?: string; slot: string }>,
  writePolicy: 'WT' | 'WB',
  readPolicy: 'NORA' | 'RA' | 'ADRA',
): string {
  const rcache = readPolicy === 'NORA' ? 'ROFF' : 'RON'
  const wcache = writePolicy === 'WB' ? 'WB' : 'WT'
  const driveList = drives.map(d => `${d.enclosure ?? '0'} ${d.slot}`).join(' ')
  return `arcconf CREATE ${ctrlNum} LOGICALDRIVE Rcache ${rcache} Wcache ${wcache} MAX ${raidLevel} ${driveList}`
}
