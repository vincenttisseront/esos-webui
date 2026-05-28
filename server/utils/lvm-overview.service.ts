/**
 * LVM overview collection via SSH (pvs/vgs/lvs JSON + raid block inventory).
 */
import type { SSHSessionManager } from './ssh-session-manager'
import { collectRaidOverview } from './raid-overview.service'
import { emptyEsosSystemProtection } from '../../utils/esos-system-protection'
import type { RaidOverviewResponse } from './raid-types'
import { parsePvsJson, parseVgsJson, parseLvsJson } from './parsers/lvm-json.parser'
import { allLvPathCandidates, mapParsedLvToLogicalVolume } from './lvm-lv-mapper'
import { buildLvmCandidatesFromInventory } from './lvm-candidates'
import { readScstDeviceIndex } from './scst-device-index'
import { collectPendingHwRaidBackends } from '../../utils/hw-raid-pending-backend'
import type {
  LvmAlert,
  LvmOverviewResponse,
  LvmToolsInfo,
  LogicalVolume,
  PhysicalVolume,
} from './lvm-types'

const LVM_OVERVIEW_CMD = [
  'echo "===TOOLS==="',
  'for t in pvs vgs lvs pvcreate vgcreate lvcreate vgremove lvremove pvremove wipefs blkid; do command -v "$t" >/dev/null 2>&1 && echo "$t"; done',
  'command -v clvmd >/dev/null 2>&1 && echo clvmd || true',
  'echo "===PVS_JSON==="',
  'pvs --reportformat json --units b --nosuffix 2>/dev/null || echo "{}"',
  'echo "===VGS_JSON==="',
  'vgs --reportformat json --units b --nosuffix 2>/dev/null || echo "{}"',
  'echo "===LVS_JSON==="',
  'lvs --reportformat json --units b --nosuffix -o lv_name,vg_name,lv_full_name,lv_path,lv_dm_path,lv_size,lv_uuid,lv_attr 2>/dev/null || echo "{}"',
  'echo "===END==="',
].join('\n')

function splitSections(stdout: string): Record<string, string> {
  const sections: Record<string, string> = {}
  let current = ''
  for (const line of stdout.split('\n')) {
    const m = line.match(/^===(\w+)===$/)
    if (m) {
      current = m[1]!
      sections[current] = ''
    } else if (current) {
      sections[current] += (sections[current] ? '\n' : '') + line
    }
  }
  return sections
}

function parseTools(raw: string): LvmToolsInfo {
  const found = new Set(raw.split('\n').map(l => l.trim()).filter(Boolean))
  return {
    pvs: found.has('pvs'),
    vgs: found.has('vgs'),
    lvs: found.has('lvs'),
    pvcreate: found.has('pvcreate'),
    vgcreate: found.has('vgcreate'),
    lvcreate: found.has('lvcreate'),
    vgremove: found.has('vgremove'),
    lvremove: found.has('lvremove'),
    pvremove: found.has('pvremove'),
    wipefs: found.has('wipefs'),
    blkid: found.has('blkid'),
    clvmd: found.has('clvmd'),
  }
}

async function scstFilenamesByPath(manager: SSHSessionManager): Promise<Map<string, string[]>> {
  try {
    const index = await readScstDeviceIndex(manager)
    return index.pathToDevices
  } catch {
    return new Map()
  }
}

function buildAlerts(tools: LvmToolsInfo, clusteredVg: boolean): LvmAlert[] {
  const alerts: LvmAlert[] = []
  if (!tools.pvs || !tools.vgs || !tools.lvs) {
    alerts.push({
      severity: 'warning',
      code: 'tools_incomplete',
      message: 'Outils LVM incomplets sur ce nœud (pvs/vgs/lvs)',
    })
  }
  if (clusteredVg) {
    alerts.push({
      severity: 'warning',
      code: 'clustered_vg_unsupported',
      message: 'Volume group clusterisé (clvmd) détecté — gestion partagée non supportée par la WebUI',
    })
  }
  return alerts
}

async function collectRaidOverviewForLvm(manager: SSHSessionManager): Promise<RaidOverviewResponse> {
  try {
    return await collectRaidOverview(manager)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('SSH') || message.includes('non connecté')) {
      throw err
    }
    return {
      scannedAt: Date.now(),
      tools: {
        mdadm: false, lspci: false, storcli: false, perccli: false, MegaCli64: false,
        arcconf: false, lsscsi: false, wipefs: false, parted: false, sfdisk: false,
        fdisk: false, partprobe: false, udevadm: false,
      },
      hardwareControllers: [],
      mdArrays: [],
      stoppedMdArrays: [],
      blockDevices: [],
      systemProtection: {
        ...emptyEsosSystemProtection(),
        errors: [message],
        warnings: ['Scan RAID partiel — inventaire LVM limité aux données LVM locales.'],
      },
      alerts: [{
        severity: 'warning',
        code: 'raid_overview_partial',
        message: `Scan RAID incomplet : ${message}`,
      }],
      mdDetection: {
        nodeSanId: '',
        nodeLabel: 'local',
        hasAnyMdState: false,
        items: [],
      },
    }
  }
}

export async function collectLvmOverview(manager: SSHSessionManager): Promise<LvmOverviewResponse> {
  const [raidOverview, lvmResult, scstMap] = await Promise.all([
    collectRaidOverviewForLvm(manager),
    manager.exec(LVM_OVERVIEW_CMD, 30_000),
    scstFilenamesByPath(manager),
  ])

  const sections = splitSections(lvmResult.stdout)
  const tools = parseTools(sections.TOOLS ?? '')

  const pvsRaw = parsePvsJson(sections.PVS_JSON ?? '{}')
  const vgsRaw = parseVgsJson(sections.VGS_JSON ?? '{}')
  const lvsRaw = parseLvsJson(sections.LVS_JSON ?? '{}')

  const blockByPath = new Map(raidOverview.blockDevices.map(d => [d.path, d]))

  const pvs: PhysicalVolume[] = pvsRaw.map(pv => {
    const dev = blockByPath.get(pv.path)
    const usedBy: PhysicalVolume['usedBy'] = []
    if (dev) {
      for (const u of dev.usedBy) {
        if (u !== 'hardware_raid') usedBy.push(u as PhysicalVolume['usedBy'][number])
      }
    }
    return { ...pv, usedBy }
  })

  const vgs = vgsRaw.map(vg => ({
    name: vg.name,
    uuid: vg.uuid,
    sizeBytes: vg.sizeBytes,
    freeBytes: vg.freeBytes,
    pvCount: vg.pvCount,
    lvCount: vg.lvCount,
    attr: vg.attr,
    clustered: vg.clustered,
  }))

  const lvs: LogicalVolume[] = lvsRaw.map(raw =>
    mapParsedLvToLogicalVolume(raw, scstMap, blockByPath),
  )
  const lvPaths = allLvPathCandidates(lvs)

  const candidates = buildLvmCandidatesFromInventory({
    blockDevices: raidOverview.blockDevices,
    mdArrays: raidOverview.mdArrays,
    hardwareControllers: raidOverview.hardwareControllers,
    pvs,
    lvPaths,
    tools: raidOverview.tools,
  })
  const pendingHwRaidBackends = collectPendingHwRaidBackends(
    raidOverview.hardwareControllers,
    raidOverview.tools,
  )
  const alerts = buildAlerts(tools, vgs.some(v => v.clustered))

  return {
    scannedAt: Date.now(),
    tools,
    pvs,
    vgs,
    lvs,
    candidates,
    pendingHwRaidBackends,
    alerts,
  }
}

export async function collectLvmOverviewLite(manager: SSHSessionManager): Promise<Pick<LvmOverviewResponse, 'pvs' | 'vgs' | 'lvs' | 'tools'>> {
  const [r, scstMap] = await Promise.all([
    manager.exec(LVM_OVERVIEW_CMD, 30_000),
    scstFilenamesByPath(manager),
  ])
  const sections = splitSections(r.stdout)
  const tools = parseTools(sections.TOOLS ?? '')
  return {
    tools,
    pvs: parsePvsJson(sections.PVS_JSON ?? '{}').map(pv => ({ ...pv, usedBy: [] })),
    vgs: parseVgsJson(sections.VGS_JSON ?? '{}').map(vg => ({
      name: vg.name,
      uuid: vg.uuid,
      sizeBytes: vg.sizeBytes,
      freeBytes: vg.freeBytes,
      pvCount: vg.pvCount,
      lvCount: vg.lvCount,
      attr: vg.attr,
      clustered: vg.clustered,
    })),
    lvs: parseLvsJson(sections.LVS_JSON ?? '{}').map(raw =>
      mapParsedLvToLogicalVolume(raw, scstMap, new Map()),
    ),
  }
}
