/**
 * Hardware RAID virtual drive → LVM / FILEIO / SCST backend eligibility and MD guards.
 */
import type { HardwareRaidController, HardwareRaidLogicalDrive, RaidBlockDevice } from '~/types/raid'

export const HW_RAID_MD_BLOCK_REASON =
  'Volume déjà en RAID matériel — utilisez LVM, FILEIO ou SCST BLOCKIO'

export const HW_RAID_MD_UNMAPPED_REASON =
  'Volume RAID matériel (chemin OS non résolu)'

export function normalizeDevPath(p: string | undefined): string | null {
  const t = p?.trim()
  if (!t) return null
  if (t.startsWith('/dev/')) return t
  if (/^sd[a-z]+$/.test(t)) return `/dev/${t}`
  return t.startsWith('disk/by-id') ? `/${t}` : `/dev/${t}`
}

export function hwLdOsPath(ld: HardwareRaidLogicalDrive): string | null {
  return normalizeDevPath(ld.devicePath) ?? normalizeDevPath(ld.scsiDevice)
}

export interface HwLdRef {
  controller: HardwareRaidController
  ld: HardwareRaidLogicalDrive
}

export function findLogicalDriveById(
  controllers: HardwareRaidController[],
  vdId: string,
): HwLdRef | null {
  const normalized = vdId.trim()
  for (const controller of controllers) {
    for (const ld of controller.logicalDrives) {
      if (ld.id === normalized || ld.id.endsWith(`/${normalized}`) || `${controller.id}/${ld.id}` === normalized) {
        return { controller, ld }
      }
    }
  }
  return null
}

export function findLogicalDriveForOsPath(
  controllers: HardwareRaidController[],
  path: string,
): HwLdRef | null {
  const target = normalizeDevPath(path)
  if (!target) return null
  for (const controller of controllers) {
    for (const ld of controller.logicalDrives) {
      const os = hwLdOsPath(ld)
      if (os && os === target) return { controller, ld }
    }
  }
  return null
}

export function markBlockDevicesFromHardwareRaid(
  controllers: HardwareRaidController[],
  blockDevices: RaidBlockDevice[],
): void {
  for (const controller of controllers) {
    const label = controller.model || controller.id
    for (const ld of controller.logicalDrives) {
      const path = hwLdOsPath(ld)
      if (!path) continue
      const dev = blockDevices.find(d => d.path === path)
      if (!dev) continue
      if (!dev.usedBy.includes('hardware_raid')) dev.usedBy.push('hardware_raid')
      dev.hwRaidControllerId = controller.id
      dev.hwRaidControllerLabel = label
      dev.hwRaidLdId = ld.id
    }
  }
}

export function applyHardwareRaidMdRestrictions(
  controllers: HardwareRaidController[],
  blockDevices: RaidBlockDevice[],
): void {
  markBlockDevicesFromHardwareRaid(controllers, blockDevices)
  const byPath = new Map(blockDevices.map(d => [d.path, d]))
  for (const dev of blockDevices) {
    if (dev.usedBy.includes('hardware_raid')) {
      dev.eligibleForMd = false
      if (!dev.mdEligibilityReasons.includes(HW_RAID_MD_BLOCK_REASON)) {
        dev.mdEligibilityReasons.push(HW_RAID_MD_BLOCK_REASON)
      }
    }
    if (dev.type !== 'part' || !dev.parent) continue
    const parentPath = dev.parent.startsWith('/dev/') ? dev.parent : `/dev/${dev.parent}`
    const parent = byPath.get(parentPath)
    if (!parent?.usedBy.includes('hardware_raid')) continue
    dev.eligibleForMd = false
    if (!dev.mdEligibilityReasons.includes(HW_RAID_MD_BLOCK_REASON)) {
      dev.mdEligibilityReasons.push(HW_RAID_MD_BLOCK_REASON)
    }
  }
  for (const dev of blockDevices) {
    if (dev.type !== 'disk') continue
    const hit = findLogicalDriveForOsPath(controllers, dev.path)
    if (!hit) continue
    if (!dev.mdPartitionPrepReasons.includes(HW_RAID_MD_BLOCK_REASON)) {
      dev.mdPartitionPrepReasons.push(HW_RAID_MD_BLOCK_REASON)
    }
    dev.eligibleForMdPartitionPrep = false
  }
}

export interface HwBackendEligibility {
  lvmEligible: boolean
  fileioEligible: boolean
  blockioEligible: boolean
  reasons: string[]
}

function collectBlockDevReasons(dev: RaidBlockDevice | undefined): string[] {
  if (!dev) return []
  const reasons: string[] = []
  if (dev.mountpoint) reasons.push(`Monté sur ${dev.mountpoint}`)
  if (dev.usedBy.includes('mounted')) reasons.push('Périphérique monté')
  if (dev.usedBy.includes('lvm')) reasons.push('Déjà volume physique LVM')
  if (dev.usedBy.includes('scst')) reasons.push('Utilisé par SCST')
  if (dev.usedBy.includes('md')) reasons.push('Membre ou signal MD')
  if (dev.usedBy.includes('filesystem') || dev.usedBy.includes('unknown_signature')) {
    reasons.push('Signature ou système de fichiers détecté')
  }
  if (dev.esosSystemProtected) {
    reasons.push(dev.esosProtection?.protectedDevice
      ? `Volume système ESOS protégé (${dev.esosProtection.protectedDevice})`
      : 'Volume système ESOS protégé')
  }
  return reasons
}

export function evaluateHwBackendEligibility(
  dev: RaidBlockDevice | undefined,
  ld?: HardwareRaidLogicalDrive,
): HwBackendEligibility {
  if (ld && (ld.state !== 'optimal' && ld.state !== 'degraded')) {
    return {
      lvmEligible: false,
      fileioEligible: false,
      blockioEligible: false,
      reasons: [`État du volume matériel : ${ld.state}`],
    }
  }
  if (!dev) {
    const unmapped = ld ? HW_RAID_MD_UNMAPPED_REASON : 'Périphérique bloc introuvable'
    return {
      lvmEligible: false,
      fileioEligible: false,
      blockioEligible: false,
      reasons: [unmapped],
    }
  }
  const reasons = collectBlockDevReasons(dev)
  const eligible = reasons.length === 0
  return {
    lvmEligible: eligible,
    fileioEligible: eligible,
    blockioEligible: eligible,
    reasons,
  }
}

export interface HwLdBackendContext {
  vdId: string
  controllerId: string
  controllerLabel: string
  osPath: string | null
  osMappingStatus: 'mapped' | 'unmapped'
  eligibility: HwBackendEligibility
}

export function resolveHwLdBackendContext(
  controllers: HardwareRaidController[],
  blockDevices: RaidBlockDevice[],
  vdId: string,
): HwLdBackendContext | null {
  const hit = findLogicalDriveById(controllers, vdId)
  if (!hit) return null
  const osPath = hwLdOsPath(hit.ld)
  const dev = osPath ? blockDevices.find(d => d.path === osPath) : undefined
  return {
    vdId: hit.ld.id,
    controllerId: hit.controller.id,
    controllerLabel: hit.controller.model || hit.controller.id,
    osPath,
    osMappingStatus: osPath ? 'mapped' : 'unmapped',
    eligibility: evaluateHwBackendEligibility(dev, hit.ld),
  }
}
