/**
 * Detect and protect ESOS boot/system block devices and mapped hardware RAID volumes.
 */
import { createError } from 'h3'
import type {
  HardwareRaidController,
  HardwareRaidLogicalDrive,
  RaidBlockDevice,
  RaidOverviewResponse,
} from './raid-types'

export const ESOS_SYSTEM_LABELS = new Set([
  'ESOS_BOOT',
  'esos_root',
  'esos_conf',
  'esos_logs',
  'esos_boot',
  'ESOS_ROOT',
  'ESOS_CONF',
  'ESOS_LOGS',
])

export const ESOS_SYSTEM_MOUNT_POINTS = new Set(['/', '/mnt/root', '/mnt/ram'])

export const ESOS_SQUASH_ROOT_BASENAMES = new Set([
  'PRIMARY-root.sqsh',
  'SECONDARY-root.sqsh',
])

export interface EsosProtectionReason {
  code:
    | 'esos_label'
    | 'root_mount'
    | 'system_mount'
    | 'squash_root_image'
    | 'duplicate_esos_label'
    | 'parent_disk_of_protected'
    | 'hardware_ld_os_device'
  message: string
}

export interface EsosDeviceProtectionInfo {
  protected: boolean
  protectedDevice: string
  reasons: EsosProtectionReason[]
  labelsFound: string[]
  mountedPaths: string[]
  relatedBlockPaths: string[]
  hardwareLogicalDriveIds?: string[]
}

export interface EsosProtectedDeviceDiagnostic {
  protectedDevice: string
  reasons: EsosProtectionReason[]
  labelsFound: string[]
  mountedPaths: string[]
  relatedBlockPaths: string[]
  hardwareLogicalDriveIds: string[]
}

export interface EsosSystemProtectionSnapshot {
  entries: EsosProtectedDeviceDiagnostic[]
  protectedBlockPaths: string[]
  protectedDiskPaths: string[]
  protectedHardwareLdIds: string[]
  duplicateEsosLabels: boolean
}

export interface EsosProtectionProbe {
  findmntLines?: string[]
  rootRealPath?: string
}

interface MutableEntry {
  protectedDevice: string
  reasons: EsosProtectionReason[]
  labels: Set<string>
  mounts: Set<string>
  blocks: Set<string>
  ldIds: Set<string>
}

export function normalizeBlockPath(path: string): string {
  const t = path.trim()
  if (!t) return t
  if (t.startsWith('/dev/')) return t
  return `/dev/${t}`
}

export function resolveParentDiskPath(path: string, blockDevices: RaidBlockDevice[]): string {
  const norm = normalizeBlockPath(path)
  const dev = blockDevices.find(d => d.path === norm)
  if (dev?.type === 'disk') return norm
  if (dev?.parent) {
    return dev.parent.startsWith('/dev/') ? dev.parent : `/dev/${dev.parent}`
  }
  const m = norm.match(/^(\/dev\/(?:nvme\d+n\d+|mmcblk\d+|sd[a-z]+))(?:p\d+|\d+)?$/i)
  if (m) return m[1]
  return norm
}

function parseFindmnt(lines: string[]): Array<{ source: string; target: string }> {
  const out: Array<{ source: string; target: string }> = []
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('===')) continue
    const parts = t.split(/\s+/)
    if (parts.length >= 2) {
      out.push({ source: parts[0], target: parts[parts.length - 1] })
    }
  }
  return out
}

function hasSquashRootSignal(dev: RaidBlockDevice, mountTargets: string[]): boolean {
  const blob = `${dev.label ?? ''} ${dev.mountpoint ?? ''} ${dev.fstype ?? ''} ${mountTargets.join(' ')}`
  for (const name of ESOS_SQUASH_ROOT_BASENAMES) {
    if (blob.includes(name)) return true
  }
  return false
}

function getOrCreateEntry(map: Map<string, MutableEntry>, diskPath: string): MutableEntry {
  let e = map.get(diskPath)
  if (!e) {
    e = {
      protectedDevice: diskPath,
      reasons: [],
      labels: new Set(),
      mounts: new Set(),
      blocks: new Set(),
      ldIds: new Set(),
    }
    map.set(diskPath, e)
  }
  return e
}

function addReason(entry: MutableEntry, reason: EsosProtectionReason, blockPath: string, label?: string, mount?: string) {
  if (!entry.reasons.some(r => r.code === reason.code && r.message === reason.message)) {
    entry.reasons.push(reason)
  }
  entry.blocks.add(normalizeBlockPath(blockPath))
  if (label) entry.labels.add(label)
  if (mount) entry.mounts.add(mount)
}

export function buildEsosSystemProtection(input: {
  blockDevices: RaidBlockDevice[]
  hardwareControllers?: HardwareRaidController[]
  probe?: EsosProtectionProbe
}): EsosSystemProtectionSnapshot {
  const { blockDevices, hardwareControllers = [], probe } = input
  const diskEntries = new Map<string, MutableEntry>()
  const protectedBlockPaths = new Set<string>()
  const protectedDiskPaths = new Set<string>()

  const findmnt = parseFindmnt(probe?.findmntLines ?? [])
  const labelToDisks = new Map<string, Set<string>>()

  for (const dev of blockDevices) {
    if (!dev.label || !ESOS_SYSTEM_LABELS.has(dev.label)) continue
    const disk = resolveParentDiskPath(dev.path, blockDevices)
    const disks = labelToDisks.get(dev.label) ?? new Set()
    disks.add(disk)
    labelToDisks.set(dev.label, disks)
  }

  const duplicateEsosLabels = [...labelToDisks.values()].some(disks => disks.size > 1)

  const protectDisk = (
    diskPath: string,
    blockPath: string,
    reason: EsosProtectionReason,
    label?: string,
    mount?: string,
  ) => {
    const disk = normalizeBlockPath(diskPath)
    const block = normalizeBlockPath(blockPath)
    protectedDiskPaths.add(disk)
    protectedBlockPaths.add(block)
    if (disk !== block) protectedBlockPaths.add(disk)
    const entry = getOrCreateEntry(diskEntries, disk)
    addReason(entry, reason, block, label, mount)
  }

  for (const dev of blockDevices) {
    const disk = resolveParentDiskPath(dev.path, blockDevices)

    if (dev.label && ESOS_SYSTEM_LABELS.has(dev.label)) {
      const reason: EsosProtectionReason = duplicateEsosLabels
        ? { code: 'duplicate_esos_label', message: `Label ESOS dupliqué : ${dev.label}` }
        : { code: 'esos_label', message: `Partition avec label ESOS : ${dev.label}` }
      protectDisk(disk, dev.path, reason, dev.label, dev.mountpoint)
    }

    if (dev.mountpoint && ESOS_SYSTEM_MOUNT_POINTS.has(dev.mountpoint)) {
      protectDisk(disk, dev.path, {
        code: 'system_mount',
        message: `Monté sur ${dev.mountpoint}`,
      }, dev.label, dev.mountpoint)
    }

    const mountHits = findmnt.filter(m => normalizeBlockPath(m.source) === dev.path || m.target === dev.mountpoint)
    for (const m of mountHits) {
      if (ESOS_SYSTEM_MOUNT_POINTS.has(m.target)) {
        protectDisk(disk, dev.path, {
          code: 'system_mount',
          message: `findmnt : ${m.source} → ${m.target}`,
        }, dev.label, m.target)
      }
    }

    if (hasSquashRootSignal(dev, findmnt.map(f => f.target))) {
      protectDisk(disk, dev.path, {
        code: 'squash_root_image',
        message: 'Image PRIMARY-root.sqsh ou SECONDARY-root.sqsh détectée',
      }, dev.label, dev.mountpoint)
    }
  }

  const rootPath = probe?.rootRealPath?.trim()
  if (rootPath) {
    const norm = normalizeBlockPath(rootPath)
    const disk = resolveParentDiskPath(norm, blockDevices)
    protectDisk(disk, norm, { code: 'root_mount', message: `Périphérique racine courant : ${norm}` })
  }

  for (const m of findmnt) {
    if (m.target !== '/') continue
    const src = normalizeBlockPath(m.source)
    const dev = blockDevices.find(d => d.path === src)
    const disk = dev ? resolveParentDiskPath(dev.path, blockDevices) : resolveParentDiskPath(src, blockDevices)
    protectDisk(disk, src, { code: 'root_mount', message: `Montage racine / ← ${src}` }, dev?.label, '/')
  }

  const protectedHardwareLdIds = new Set<string>()

  for (const ctrl of hardwareControllers) {
    for (const ld of ctrl.logicalDrives) {
      const osPath = ld.devicePath?.trim() || ld.scsiDevice?.trim()
      if (!osPath) continue
      const norm = normalizeBlockPath(osPath)
      const disk = resolveParentDiskPath(norm, blockDevices)
      if (!protectedDiskPaths.has(disk) && !protectedBlockPaths.has(norm)) continue
      protectedHardwareLdIds.add(ld.id)
      const entry = getOrCreateEntry(diskEntries, disk)
      entry.ldIds.add(ld.id)
      addReason(entry, {
        code: 'hardware_ld_os_device',
        message: `Volume logique matériel ${ld.id} mappé sur ${norm}`,
      }, norm, undefined, ld.devicePath)
    }
  }

  const entries: EsosProtectedDeviceDiagnostic[] = [...diskEntries.values()].map(e => ({
    protectedDevice: e.protectedDevice,
    reasons: e.reasons,
    labelsFound: [...e.labels],
    mountedPaths: [...e.mounts],
    relatedBlockPaths: [...e.blocks],
    hardwareLogicalDriveIds: [...e.ldIds],
  }))

  return {
    entries,
    protectedBlockPaths: [...protectedBlockPaths],
    protectedDiskPaths: [...protectedDiskPaths],
    protectedHardwareLdIds: [...protectedHardwareLdIds],
    duplicateEsosLabels,
  }
}

export function findProtectionForBlockPath(
  path: string,
  snapshot: EsosSystemProtectionSnapshot,
  blockDevices: RaidBlockDevice[],
): EsosDeviceProtectionInfo | null {
  const norm = normalizeBlockPath(path)
  const disk = resolveParentDiskPath(norm, blockDevices)
  if (!snapshot.protectedBlockPaths.includes(norm) && !snapshot.protectedDiskPaths.includes(disk)) {
    return null
  }
  const entry = snapshot.entries.find(e => e.protectedDevice === disk)
  if (!entry) {
    return {
      protected: true,
      protectedDevice: disk,
      reasons: [{ code: 'parent_disk_of_protected', message: 'Périphérique parent du volume système ESOS' }],
      labelsFound: [],
      mountedPaths: [],
      relatedBlockPaths: [norm],
    }
  }
  return {
    protected: true,
    protectedDevice: entry.protectedDevice,
    reasons: entry.reasons,
    labelsFound: entry.labelsFound,
    mountedPaths: entry.mountedPaths,
    relatedBlockPaths: entry.relatedBlockPaths,
    hardwareLogicalDriveIds: entry.hardwareLogicalDriveIds,
  }
}

export function findProtectionForHardwareLd(
  ldId: string,
  snapshot: EsosSystemProtectionSnapshot,
  controllers: HardwareRaidController[],
): EsosDeviceProtectionInfo | null {
  if (!snapshot.protectedHardwareLdIds.includes(ldId)) return null
  for (const ctrl of controllers) {
    const ld = ctrl.logicalDrives.find(l => l.id === ldId)
    if (!ld) continue
    const entry = snapshot.entries.find(e => e.hardwareLogicalDriveIds.includes(ldId))
    const osPath = ld.devicePath ?? ld.scsiDevice
    return {
      protected: true,
      protectedDevice: entry?.protectedDevice ?? (osPath ? resolveParentDiskPath(osPath, []) : ldId),
      reasons: entry?.reasons ?? [{
        code: 'hardware_ld_os_device',
        message: `Volume logique matériel ${ldId} protégé (volume système ESOS)`,
      }],
      labelsFound: entry?.labelsFound ?? [],
      mountedPaths: entry?.mountedPaths ?? [],
      relatedBlockPaths: entry?.relatedBlockPaths ?? (osPath ? [normalizeBlockPath(osPath)] : []),
      hardwareLogicalDriveIds: [ldId],
    }
  }
  return {
    protected: true,
    protectedDevice: ldId,
    reasons: [{ code: 'hardware_ld_os_device', message: `Volume logique matériel ${ldId} protégé` }],
    labelsFound: [],
    mountedPaths: [],
    relatedBlockPaths: [],
    hardwareLogicalDriveIds: [ldId],
  }
}

export function assertBlockPathNotEsosProtected(
  path: string,
  snapshot: EsosSystemProtectionSnapshot,
  blockDevices: RaidBlockDevice[],
): void {
  const info = findProtectionForBlockPath(path, snapshot, blockDevices)
  if (!info) return
  throwEsosProtectedError(info)
}

export function assertHardwareLdNotEsosProtected(
  ldId: string,
  snapshot: EsosSystemProtectionSnapshot,
  controllers: HardwareRaidController[],
): void {
  const info = findProtectionForHardwareLd(ldId, snapshot, controllers)
  if (!info) return
  throwEsosProtectedError(info)
}

export function throwEsosProtectedError(info: EsosDeviceProtectionInfo): never {
  throw createError({
    statusCode: 403,
    statusMessage: `Volume système ESOS protégé (${info.protectedDevice})`,
    data: {
      code: 'ESOS_SYSTEM_VOLUME_PROTECTED',
      protectedDevice: info.protectedDevice,
      reasons: info.reasons,
      labelsFound: info.labelsFound,
      mountedPaths: info.mountedPaths,
      relatedBlockPaths: info.relatedBlockPaths,
      hardwareLogicalDriveIds: info.hardwareLogicalDriveIds,
    },
  })
}

export function applyEsosProtectionToOverview(
  overview: Pick<RaidOverviewResponse, 'blockDevices' | 'hardwareControllers'>,
  probe?: EsosProtectionProbe,
): EsosSystemProtectionSnapshot {
  const snapshot = buildEsosSystemProtection({
    blockDevices: overview.blockDevices,
    hardwareControllers: overview.hardwareControllers,
    probe,
  })

  for (const dev of overview.blockDevices) {
    const info = findProtectionForBlockPath(dev.path, snapshot, overview.blockDevices)
    if (!info) continue
    dev.esosSystemProtected = true
    dev.esosProtection = info
    dev.eligibleForHardwareRaid = false
    dev.eligibleForMd = false
    if (!dev.mdEligibilityReasons.includes('Volume système ESOS protégé')) {
      dev.mdEligibilityReasons.push('Volume système ESOS protégé')
    }
    if (!dev.warnings.some(w => w.includes('système ESOS'))) {
      dev.warnings.push('Volume système ESOS — actions destructives bloquées')
    }
  }

  for (const ctrl of overview.hardwareControllers) {
    for (const ld of ctrl.logicalDrives) {
      const info = findProtectionForHardwareLd(ld.id, snapshot, overview.hardwareControllers)
      if (!info) continue
      ld.esosSystemProtected = true
      ld.esosProtection = info
      if (!ld.warnings) ld.warnings = []
      if (!ld.warnings.some(w => w.includes('système ESOS'))) {
        ld.warnings.push('Volume système ESOS — suppression bloquée')
      }
    }
  }

  return snapshot
}

export function esosProtectionBlockerMessage(info: EsosDeviceProtectionInfo): string {
  const parts = info.reasons.map(r => r.message)
  return `Volume système ESOS protégé (${info.protectedDevice}) : ${parts.join(' ; ')}`
}
