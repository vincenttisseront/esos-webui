import type { HardwareRaidController, HardwareRaidLogicalDrive, MdArray, RaidBlockDevice, RaidToolsInfo } from './raid-types'
import { hwLdUnmappedReasonKey } from './hw-raid-os-mapper'
import type { LvmCandidateDevice, LvmCandidateKind, LvmUsedBy, PhysicalVolume } from './lvm-types'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i

function isActiveMdArray(arr: MdArray): boolean {
  return (arr.state === 'clean' || arr.state === 'active')
    && arr.failedDevices === 0
    && arr.activeDevices >= arr.raidDevices
}

function hwLdPath(ld: HardwareRaidLogicalDrive): string | null {
  const p = ld.devicePath?.trim() || ld.scsiDevice?.trim()
  if (!p) return null
  return p.startsWith('/dev/') ? p : `/dev/${p}`
}

function hwLdEligible(ld: HardwareRaidLogicalDrive): boolean {
  return ld.state === 'optimal' || ld.state === 'degraded'
}

function candidateFromPath(input: {
  path: string
  kind: LvmCandidateKind
  sizeBytes: number
  usedBy: LvmUsedBy[]
  reasons: string[]
  stableId?: string
  model?: string
  serial?: string
  signatures?: string[]
}): LvmCandidateDevice {
  return {
    path: input.path,
    stableId: input.stableId,
    kind: input.kind,
    sizeBytes: input.sizeBytes,
    eligible: input.reasons.length === 0,
    reasons: input.reasons,
    usedBy: input.usedBy,
    signatures: input.signatures ?? [],
    model: input.model,
    serial: input.serial,
  }
}

function candidateKind(dev: RaidBlockDevice): LvmCandidateKind {
  if (dev.type === 'raid' || MD_PATH_RE.test(dev.path)) return 'md'
  if (dev.type === 'disk') return 'disk'
  if (dev.type === 'part') return 'part'
  return 'unknown'
}

function mapUsedBy(dev: RaidBlockDevice): LvmUsedBy[] {
  const out: LvmUsedBy[] = []
  for (const u of dev.usedBy) {
    if (u === 'hardware_raid') continue
    if (u === 'filesystem' || u === 'md' || u === 'lvm' || u === 'scst' || u === 'mounted' || u === 'unknown_signature') {
      out.push(u)
    }
  }
  if (dev.type === 'lvm') out.push('lvm')
  return [...new Set(out)]
}

function evaluateBlockDevice(
  dev: RaidBlockDevice,
  pvPaths: Set<string>,
  lvPaths: Set<string>,
): LvmCandidateDevice | null {
  if (dev.type === 'lvm' || dev.type === 'rom') return null
  if (lvPaths.has(dev.path) || pvPaths.has(dev.path)) return null

  const kind = candidateKind(dev)
  const reasons: string[] = []
  const usedBy = mapUsedBy(dev)

  if (dev.type === 'part') {
    reasons.push('Les partitions ne sont pas proposées pour pvcreate')
  }
  if (kind === 'disk') {
    reasons.push('Disque brut non proposé pour pvcreate — utilisez un tableau MD ou un volume RAID matériel')
  }
  if (dev.mountpoint || usedBy.includes('mounted')) {
    reasons.push(dev.mountpoint ? `Monté sur ${dev.mountpoint}` : 'Périphérique monté')
  }
  if (usedBy.includes('lvm')) reasons.push('Déjà volume physique LVM')
  if (usedBy.includes('scst')) reasons.push('Utilisé par SCST')
  if (usedBy.includes('md') && kind !== 'md') reasons.push('Membre ou signal MD')
  if (usedBy.includes('filesystem') || usedBy.includes('unknown_signature')) {
    reasons.push('Signature ou système de fichiers détecté — wipefs requis avant pvcreate')
  }
  if (kind === 'unknown') reasons.push('Type de périphérique non pris en charge')
  if (dev.esosSystemProtected) {
    reasons.push(dev.esosProtection?.protectedDevice
      ? `Volume système ESOS protégé (${dev.esosProtection.protectedDevice})`
      : 'Volume système ESOS protégé')
  }

  return candidateFromPath({
    path: dev.path,
    kind,
    sizeBytes: dev.sizeBytes,
    usedBy,
    reasons,
    stableId: dev.idSerial ?? dev.wwn ?? dev.byIdPaths?.[0],
    model: dev.model,
    serial: dev.serial,
    signatures: dev.diskSignatures ?? dev.wipefsSignatures ?? [],
  })
}

export interface LvmCandidateInventoryInput {
  blockDevices: RaidBlockDevice[]
  mdArrays?: MdArray[]
  hardwareControllers?: HardwareRaidController[]
  pvs: PhysicalVolume[]
  lvPaths: Set<string>
  tools?: RaidToolsInfo
}

export function buildLvmCandidatesFromInventory(input: LvmCandidateInventoryInput): LvmCandidateDevice[] {
  const pvPaths = new Set(input.pvs.map(p => p.path))
  const seen = new Set<string>()
  const candidates: LvmCandidateDevice[] = []

  const push = (c: LvmCandidateDevice | null) => {
    if (!c || seen.has(c.path)) return
    seen.add(c.path)
    candidates.push(c)
  }

  for (const arr of input.mdArrays ?? []) {
    if (!isActiveMdArray(arr)) continue
    if (pvPaths.has(arr.path)) continue
    const usedBy: LvmUsedBy[] = []
    if (arr.usedBy?.includes('lvm')) usedBy.push('lvm')
    if (arr.usedBy?.includes('scst')) usedBy.push('scst')
    const reasons: string[] = []
    if (usedBy.includes('lvm')) reasons.push('Déjà volume physique LVM')
    if (usedBy.includes('scst')) reasons.push('Utilisé par SCST')
    push(candidateFromPath({
      path: arr.path,
      kind: 'md',
      sizeBytes: arr.sizeBytes ?? 0,
      usedBy,
      reasons,
      stableId: arr.uuid,
    }))
  }

  const raidTools: RaidToolsInfo = input.tools ?? {
    mdadm: false,
    lspci: false,
    storcli: false,
    perccli: false,
    MegaCli64: false,
    arcconf: false,
    lsscsi: false,
    wipefs: false,
    parted: false,
    sfdisk: false,
    fdisk: false,
    partprobe: false,
    udevadm: false,
  }

  for (const ctrl of input.hardwareControllers ?? []) {
    for (const ld of ctrl.logicalDrives) {
      if (!hwLdEligible(ld)) continue
      const path = hwLdPath(ld)
      if (!path) {
        push(candidateFromPath({
          path: `hw:${ctrl.id}/${ld.id}`,
          kind: 'hw_raid_ld',
          sizeBytes: ld.sizeBytes ?? 0,
          usedBy: [],
          reasons: [hwLdUnmappedReasonKey(raidTools)],
          model: ld.scsiModel,
        }))
        continue
      }
      if (pvPaths.has(path)) continue
      const dev = input.blockDevices.find(d => d.path === path)
      if (dev) {
        push(evaluateBlockDevice(dev, pvPaths, input.lvPaths))
        continue
      }
      push(candidateFromPath({
        path,
        kind: 'hw_raid_ld',
        sizeBytes: ld.sizeBytes ?? 0,
        usedBy: [],
        reasons: [],
        model: ld.scsiModel,
      }))
    }
  }

  for (const dev of input.blockDevices) {
    if (MD_PATH_RE.test(dev.path)) {
      const already = candidates.find(c => c.path === dev.path)
      if (already) continue
    }
    push(evaluateBlockDevice(dev, pvPaths, input.lvPaths))
  }

  return candidates.sort((a, b) => {
    const rank: Record<LvmCandidateKind, number> = { md: 0, hw_raid_ld: 1, disk: 2, part: 3, unknown: 4 }
    return (rank[a.kind] - rank[b.kind]) || a.path.localeCompare(b.path)
  })
}

/** @deprecated use buildLvmCandidatesFromInventory */
export function buildLvmCandidates(
  blockDevices: RaidBlockDevice[],
  pvs: PhysicalVolume[],
  lvPaths: Set<string>,
): LvmCandidateDevice[] {
  return buildLvmCandidatesFromInventory({ blockDevices, pvs, lvPaths })
}
