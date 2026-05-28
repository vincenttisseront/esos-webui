import type { RaidOverview, RaidBlockDevice, RaidToolsInfo } from './raid-types'
import { hwLdUnmappedReasonKey } from './hw-raid-os-mapper'
import {
  FS_BACKEND_REASON,
  mountedAtReason,
  normalizeBackendReason,
} from './fs-backend-reasons'
import type { LvmOverview } from './lvm-types'
import type {
  FileSystemMount,
  FsBackendKind,
  FsBackendRef,
  FsBackendSource,
  FsDetectionDiagnostics,
  FsResourceLink,
} from '~/types/filesystem'
import {
  classifyMountRole,
  devPathBasename,
  normalizeDevPath,
  vdiskMountRootsFromEnv,
} from '~/utils/fs-mount-classifier'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i

export type PathAliasIndex = Map<string, Set<string>>

export function buildPathAliasIndex(blockDevices: RaidBlockDevice[]): PathAliasIndex {
  const index: PathAliasIndex = new Map()
  const add = (canonical: string, alias: string) => {
    const c = normalizeDevPath(canonical)
    const a = normalizeDevPath(alias)
    if (!c || !a) return
    if (!index.has(c)) index.set(c, new Set([c]))
    index.get(c)!.add(a)
    index.get(c)!.add(c)
    if (!index.has(a)) index.set(a, new Set([a]))
    const setA = index.get(a)!
    for (const x of index.get(c)!) setA.add(x)
  }

  for (const dev of blockDevices) {
    add(dev.path, dev.path)
    if (dev.name) add(dev.path, `/dev/${dev.name}`)
    for (const p of dev.byIdPaths ?? []) add(dev.path, p)
    if (dev.wwn) add(dev.path, `/dev/disk/by-id/wwn-${dev.wwn}`)
  }
  return index
}

export function resolveCanonicalPath(path: string, index: PathAliasIndex): string {
  const n = normalizeDevPath(path)
  if (index.has(n)) return [...index.get(n)!][0]
  const base = devPathBasename(n)
  for (const [canonical, aliases] of index) {
    if (devPathBasename(canonical) === base) return canonical
    for (const a of aliases) {
      if (devPathBasename(a) === base) return canonical
    }
  }
  return n
}

function hwLdPath(ld: { devicePath?: string; scsiDevice?: string }): string | null {
  const p = (ld as { osDevicePath?: string }).osDevicePath?.trim() || ld.devicePath?.trim() || ld.scsiDevice?.trim()
  if (!p) return null
  return normalizeDevPath(p)
}

function backendSourceForKind(kind: FsBackendKind): FsBackendSource {
  if (kind === 'hw_raid_ld') return 'hw_raid'
  if (kind === 'md') return 'md'
  if (kind === 'lvm_lv') return 'lvm_lv'
  return 'disk'
}

function mountForDevicePath(
  path: string,
  index: PathAliasIndex,
  mounts: FileSystemMount[],
): string | undefined {
  const canonical = resolveCanonicalPath(path, index)
  for (const m of mounts) {
    const paths = m.backingPaths ?? [m.backingDevice]
    for (const bp of paths) {
      if (resolveCanonicalPath(bp, index) === canonical) return m.mountPoint
    }
  }
  return undefined
}

function usedByFromBlockDev(dev: RaidBlockDevice | undefined): string[] {
  if (!dev) return []
  const reasons: string[] = []
  const signatures = dev.diskSignatures ?? dev.wipefsSignatures ?? []
  if (dev.usedBy.includes('mounted') || dev.mountpoint) {
    reasons.push(dev.mountpoint ? mountedAtReason(dev.mountpoint) : FS_BACKEND_REASON.MOUNTED)
  }
  if (dev.usedBy.includes('scst')) reasons.push(FS_BACKEND_REASON.SCST)
  // Unknown/empty signature should not block brand-new hardware RAID disks.
  if (dev.usedBy.includes('filesystem') || signatures.length > 0) {
    reasons.push(FS_BACKEND_REASON.FILESYSTEM_SIGNATURE)
  }
  if (dev.esosSystemProtected) {
    reasons.push(dev.esosProtection?.protectedDevice
      ? `Volume système ESOS protégé (${dev.esosProtection.protectedDevice})`
      : 'Volume système ESOS protégé')
  }
  if (dev.usedBy.includes('lvm')) reasons.push(FS_BACKEND_REASON.LVM_PV)
  if (dev.usedBy.includes('md')) reasons.push(FS_BACKEND_REASON.MD_MEMBER)
  return reasons
}

function classifyBackendEligibility(
  reasons: string[],
): 'eligible_clean' | 'eligible_with_wipe_required' | 'blocked' {
  if (!reasons.length) return 'eligible_clean'
  const normalized = reasons.map(r => normalizeBackendReason(r))
  const hasSignatureOnly = normalized.every(r => r === FS_BACKEND_REASON.FILESYSTEM_SIGNATURE)
  if (hasSignatureOnly) return 'eligible_with_wipe_required'
  return 'blocked'
}

export interface BuildFsInventoryInput {
  raid: RaidOverview
  lvm: LvmOverview
  mounts: FileSystemMount[]
  pathToDevices: Map<string, string[]>
  allowRawDisk?: boolean
  tools?: RaidToolsInfo
}

export interface FsInventoryResult {
  backends: FsBackendRef[]
  links: FsResourceLink[]
  mounts: FileSystemMount[]
}

export function enrichMountsWithRolesAndLinks(
  mounts: FileSystemMount[],
  fileioFilenames: string[],
  index: PathAliasIndex,
): { mounts: FileSystemMount[]; links: FsResourceLink[] } {
  const links: FsResourceLink[] = []
  const fileioPaths = fileioFilenames.filter(Boolean)
  for (const m of mounts) {
    m.role = classifyMountRole(m.mountPoint, { fileioFilenames: fileioPaths })
    const paths = new Set<string>([normalizeDevPath(m.backingDevice)])
    const canonical = resolveCanonicalPath(m.backingDevice, index)
    if (canonical) paths.add(canonical)
    for (const [, aliases] of index) {
      if (aliases.has(normalizeDevPath(m.backingDevice))) {
        for (const a of aliases) paths.add(a)
      }
    }
    m.backingPaths = [...paths]
    m.linkedBackendPath = canonical || m.backingDevice
    if (m.linkedBackendPath) {
      links.push({
        from: 'mount',
        fromId: m.mountPoint,
        to: 'backend',
        toId: m.linkedBackendPath,
        relation: 'backs',
      })
    }
  }
  return { mounts, links }
}

export function buildFsBackendsAndLinks(input: BuildFsInventoryInput): FsInventoryResult {
  const { raid, lvm, mounts, pathToDevices, allowRawDisk } = input
  const index = buildPathAliasIndex(raid.blockDevices)
  const lvPaths = new Set(lvm.lvs.map(lv => lv.path))
  const pvPaths = new Set(lvm.pvs.map(p => p.path))
  const backends: FsBackendRef[] = []
  const links: FsResourceLink[] = []
  const seen = new Set<string>()

  const backendKey = (path: string) =>
    path.startsWith('hw:') ? path : resolveCanonicalPath(path, index)

  const push = (b: FsBackendRef) => {
    const eligibility = b.eligibility ?? classifyBackendEligibility(b.reasons)
    const normalized: FsBackendRef = {
      ...b,
      eligibility,
      eligible: eligibility !== 'blocked',
    }
    const key = backendKey(b.path)
    if (seen.has(key)) {
      const existing = backends.find(x => backendKey(x.path) === key)
      if (existing) {
        existing.reasons = [...new Set([...existing.reasons, ...normalized.reasons])]
        if (normalized.mountPoint) existing.mountPoint = normalized.mountPoint
        existing.eligibility = classifyBackendEligibility(existing.reasons)
        existing.eligible = existing.eligibility !== 'blocked'
      }
      return
    }
    seen.add(key)
    backends.push({ ...normalized, path: key })
  }

  for (const lv of lvm.lvs) {
    const reasons: string[] = []
    if (lv.usedBy?.includes('scst') || (lv.scstDeviceNames?.length ?? 0) > 0) {
      reasons.push(FS_BACKEND_REASON.SCST_BLOCKIO)
    }
    if (lv.usedBy?.includes('mounted')) reasons.push(FS_BACKEND_REASON.MOUNTED)
    const mp = mountForDevicePath(lv.path, index, mounts)
    if (mp) reasons.push(mountedAtReason(mp))
    push({
      path: lv.path,
      kind: 'lvm_lv',
      source: 'lvm_lv',
      sizeBytes: lv.sizeBytes,
      eligible: reasons.length === 0,
      reasons,
      displayName: lv.displayName,
      mountPoint: mp,
      scstDeviceNames: lv.scstDeviceNames,
    })
  }

  for (const arr of raid.mdArrays) {
    if (arr.state !== 'clean' && arr.state !== 'active') continue
    const path = arr.path
    if (!path) continue
    const dev = raid.blockDevices.find(d => resolveCanonicalPath(d.path, index) === resolveCanonicalPath(path, index))
    const reasons = usedByFromBlockDev(dev)
    const mp = mountForDevicePath(path, index, mounts)
    if (mp && !reasons.some(r => r === FS_BACKEND_REASON.MOUNTED || r.startsWith(`${FS_BACKEND_REASON.MOUNTED_AT}:`))) {
      reasons.push(mountedAtReason(mp))
    }
    push({
      path,
      kind: 'md',
      source: 'md',
      sizeBytes: arr.sizeBytes ?? dev?.sizeBytes ?? 0,
      eligible: reasons.length === 0,
      reasons,
      displayName: arr.name,
      mountPoint: mp,
      signatures: dev?.diskSignatures,
    })
  }

  const raidTools: RaidToolsInfo = input.tools ?? raid.tools ?? {
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

  for (const ctrl of raid.hardwareControllers) {
    const ctrlLabel = ctrl.model || ctrl.id
    for (const ld of ctrl.logicalDrives) {
      if (ld.state !== 'optimal' && ld.state !== 'degraded') continue
      const rawPath = hwLdPath(ld)
      if (!rawPath) {
        push({
          path: `hw:${ctrl.id}/${ld.id}`,
          kind: 'hw_raid_ld',
          source: 'hw_raid',
          sizeBytes: ld.sizeBytes ?? 0,
          eligible: false,
          reasons: [hwLdUnmappedReasonKey(raidTools)],
          displayName: ld.name ?? ld.id,
          hwLdId: ld.id,
          controllerLabel: ctrlLabel,
        })
        continue
      }
      const path = resolveCanonicalPath(rawPath, index)
      const dev = raid.blockDevices.find(d => resolveCanonicalPath(d.path, index) === path)
      const reasons = usedByFromBlockDev(dev)
      if (pvPaths.has(path)) reasons.push(FS_BACKEND_REASON.LVM_PV)
      if (lvPaths.has(path)) reasons.push(FS_BACKEND_REASON.LVM_LV)
      const mp = mountForDevicePath(path, index, mounts) ?? dev?.mountpoint ?? undefined
      if (mp && !reasons.some(r => r === FS_BACKEND_REASON.MOUNTED || r.startsWith(`${FS_BACKEND_REASON.MOUNTED_AT}:`))) {
        reasons.push(mountedAtReason(mp))
      }
      const scstNames = pathToDevices.get(path) ?? []
      if (scstNames.length) reasons.push(FS_BACKEND_REASON.SCST)
      push({
        path,
        kind: 'hw_raid_ld',
        source: 'hw_raid',
        sizeBytes: ld.sizeBytes ?? dev?.sizeBytes ?? 0,
        eligible: reasons.length === 0,
        reasons,
        displayName: ld.name ?? ld.id,
        hwLdId: ld.id,
        controllerLabel: ctrlLabel,
        raidLevel: ld.raidLevel,
        mountPoint: mp,
        scstDeviceNames: scstNames.length ? scstNames : undefined,
        signatures: dev?.diskSignatures,
      })
      links.push({
        from: 'backend',
        fromId: path,
        to: 'backend',
        toId: `hw:${ld.id}`,
        relation: 'backs',
      })
    }
  }

  if (allowRawDisk) {
    for (const dev of raid.blockDevices) {
      if (dev.type !== 'disk' || pvPaths.has(dev.path)) continue
      const path = resolveCanonicalPath(dev.path, index)
      if (seen.has(path)) continue
      const reasons = usedByFromBlockDev(dev)
      push({
        path,
        kind: 'disk',
        source: 'disk',
        sizeBytes: dev.sizeBytes,
        eligible: reasons.length === 0,
        reasons,
        mountPoint: dev.mountpoint ?? mountForDevicePath(path, index, mounts),
        signatures: dev.diskSignatures,
      })
    }
  }

  backends.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))
  return { backends, links, mounts }
}

export function buildFsResourceLinks(
  backends: FsBackendRef[],
  mounts: FileSystemMount[],
  vdiskPaths: Array<{ path: string; fileioDeviceName?: string }>,
  fileioDevices: Array<{ name: string; filename: string }>,
  lunMappings: Array<{ deviceName: string; targetName: string; lunId: number }>,
): FsResourceLink[] {
  const links: FsResourceLink[] = []

  for (const v of vdiskPaths) {
    const mp = mounts.find(m => v.path.startsWith(`${m.mountPoint}/`))
    if (mp) {
      links.push({ from: 'mount', fromId: mp.mountPoint, to: 'vdisk', toId: v.path, relation: 'hosts' })
    }
    if (v.fileioDeviceName) {
      links.push({ from: 'vdisk', fromId: v.path, to: 'fileio', toId: v.fileioDeviceName, relation: 'registers' })
    }
  }

  for (const d of fileioDevices) {
    if (d.filename) {
      links.push({ from: 'fileio', fromId: d.name, to: 'vdisk', toId: d.filename, relation: 'registers' })
    }
    for (const lun of lunMappings.filter(l => l.deviceName === d.name)) {
      links.push({
        from: 'fileio',
        fromId: d.name,
        to: 'lun',
        toId: `${lun.targetName}:${lun.lunId}`,
        relation: 'exposes',
      })
    }
  }

  for (const b of backends) {
    if (b.mountPoint) {
      links.push({ from: 'backend', fromId: b.path, to: 'mount', toId: b.mountPoint, relation: 'hosts' })
    }
  }

  return links
}

export function buildFsDiagnostics(params: {
  findmntCount: number
  lsblkCount: number
  dfCount: number
  mounts: FileSystemMount[]
  scstConfigBytes: number
  scstHandlers: number
  fileioCount: number
  lunCount: number
  sysfsDeviceCount: number
  vdiskFileCount?: number
  backends: FsBackendRef[]
  vdiskScanRoots: string[]
  warnings: string[]
}): FsDetectionDiagnostics {
  const byKind: Partial<Record<FsBackendKind, number>> = {}
  for (const b of params.backends) {
    byKind[b.kind] = (byKind[b.kind] ?? 0) + 1
  }
  return {
    mountCounts: {
      findmnt: params.findmntCount,
      lsblk: params.lsblkCount,
      df: params.dfCount,
      fileioData: params.mounts.filter(m => m.role === 'fileio_data').length,
      system: params.mounts.filter(m => m.role === 'system').length,
      other: params.mounts.filter(m => m.role === 'other').length,
    },
    scst: {
      configBytes: params.scstConfigBytes,
      handlers: params.scstHandlers,
      fileioDevices: params.fileioCount,
      lunMappings: params.lunCount,
      sysfsDevices: params.sysfsDeviceCount,
    },
    vdiskFiles: params.vdiskFileCount,
    candidates: {
      total: params.backends.length,
      eligible: params.backends.filter(b => b.eligible).length,
      byKind,
    },
    vdiskScanRoots: params.vdiskScanRoots,
    excludedMounts: params.mounts.filter(m => m.role === 'system').map(m => m.mountPoint),
    warnings: params.warnings,
  }
}

export { vdiskMountRootsFromEnv }
