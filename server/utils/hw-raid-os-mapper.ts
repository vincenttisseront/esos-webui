/**
 * Correlate PERC/StorCLI logical drives with Linux block device paths.
 */
import type { FileSystemMount } from '~/types/filesystem'
import type {
  HardwareRaidController,
  HardwareRaidLogicalDrive,
  RaidBlockDevice,
  RaidToolsInfo,
} from './raid-types'
import type { KernelExposedLogicalDrive } from './raid-pci-detection'

export type HwLdOsMatchMethod =
  | 'os_drive_name'
  | 'lsscsi'
  | 'size_vendor'
  | 'size_wwn'
  | 'size_serial'
  | 'mount_backing'
  | 'order'

export interface HwLdOsMappingCandidate {
  path: string
  score: number
  reasons: string[]
}

export interface HwLdOsMappingDiagnostic {
  controllerId: string
  vdId: string
  sizeBytes?: number
  expectedIdentifiers: {
    wwn?: string
    serial?: string
    scsiAddress?: string
    inquiry?: string
  }
  candidateOsPaths: HwLdOsMappingCandidate[]
  matchedPath?: string
  matchMethod?: HwLdOsMatchMethod
  mappingSource?: 'cli' | 'lsscsi' | 'heuristic'
  mappedSgPath?: string
  mappedScsiTuple?: string
  confidence?: 'high' | 'medium' | 'low'
  failureReason?: string
}

export interface HwLdOsMappingInput {
  controllers: HardwareRaidController[]
  blockDevices: RaidBlockDevice[]
  kernelLogicalDrives: KernelExposedLogicalDrive[]
  tools: RaidToolsInfo
  mounts?: FileSystemMount[]
}

const SIZE_TOLERANCE = 0.10

function normalizeOsPath(p: string | undefined): string | null {
  const t = p?.trim()
  if (!t) return null
  if (t.startsWith('/dev/')) return t
  if (/^sd[a-z]+$/.test(t)) return `/dev/${t}`
  return t.startsWith('disk/by-id') ? `/${t}` : `/dev/${t}`
}

function sizeMatch(a: number | undefined, b: number | undefined): boolean {
  if (!a || !b || a <= 0 || b <= 0) return false
  const ratio = Math.min(a, b) / Math.max(a, b)
  return ratio >= 1 - SIZE_TOLERANCE
}

function isRaidExposedDisk(dev: RaidBlockDevice): boolean {
  if (dev.type !== 'disk') return false
  const blob = `${dev.vendor ?? ''} ${dev.model ?? ''} ${dev.idModel ?? ''}`.toLowerCase()
  return (
    blob.includes('perc')
    || blob.includes('megaraid')
    || blob.includes('dell')
    || blob.includes('lsi')
    || blob.includes('avago')
    || blob.includes('broadcom')
    || dev.usedBy.includes('hardware_raid')
  )
}

function wwnNorm(w?: string): string {
  return (w ?? '').replace(/^0x/i, '').replace(/\s/g, '').toLowerCase()
}

function serialNorm(s?: string): string {
  return (s ?? '').trim().toLowerCase()
}

function parseVdIndex(ldId: string): number {
  const m = ldId.match(/(?:vd|ld)(\d+)/i)
  if (m) return Number.parseInt(m[1], 10)
  const tailNum = ldId.match(/(?:^|\/)(\d+)$/)
  if (tailNum) return Number.parseInt(tailNum[1], 10)
  const slashNum = ldId.match(/^\d+\/(\d+)$/)
  if (slashNum) return Number.parseInt(slashNum[1], 10)
  return m ? Number.parseInt(m[1], 10) : 0
}

function parseScsiTuple(scsiAddress: string | undefined): { host: number; channel: number; target: number; lun: number } | null {
  if (!scsiAddress) return null
  const m = scsiAddress.trim().match(/^(\d+):(\d+):(\d+):(\d+)$/)
  if (!m) return null
  return {
    host: Number.parseInt(m[1], 10),
    channel: Number.parseInt(m[2], 10),
    target: Number.parseInt(m[3], 10),
    lun: Number.parseInt(m[4], 10),
  }
}

function cliOsPath(ld: HardwareRaidLogicalDrive): string | null {
  return normalizeOsPath(ld.devicePath) ?? normalizeOsPath(ld.scsiDevice)
}

function kernelDrivesForController(
  ctrl: HardwareRaidController,
  allKernel: KernelExposedLogicalDrive[],
  singleController: boolean,
): KernelExposedLogicalDrive[] {
  if (singleController) return allKernel
  const filtered = allKernel.filter(ld =>
    ld.scsiAddress.startsWith(`${ctrl.id}:`)
    || ld.id.includes(ctrl.id),
  )
  // Some controllers report VD ids as "1/vd1" (DG/VD) while controller id is "0".
  // When strict host/controller filtering yields nothing, keep RAID-like kernel
  // disks so lsscsi fallback can still map VD target->/dev/sdX.
  if (filtered.length > 0) return filtered
  return allKernel.filter((ld) => {
    const blob = `${ld.vendor} ${ld.model}`.toLowerCase()
    return blob.includes('perc') || blob.includes('megaraid') || blob.includes('dell') || blob.includes('lsi')
  })
}

function matchFromKernel(
  ctrl: HardwareRaidController,
  ld: HardwareRaidLogicalDrive,
  kernelPool: KernelExposedLogicalDrive[],
  blockDevices: RaidBlockDevice[],
  used: Set<string>,
): { path: string; method: HwLdOsMatchMethod; scsiAddress?: string; sgPath?: string } | null {
  const candidates: Array<{ path: string; method: HwLdOsMatchMethod; scsiAddress?: string; sgPath?: string; score: number }> = []

  for (const k of kernelPool) {
    const path = normalizeOsPath(k.devicePath)
    if (!path || used.has(path)) continue
    const dev = blockDevices.find(d => d.path === path)
    const sizeOk = !ld.sizeBytes || sizeMatch(ld.sizeBytes, dev?.sizeBytes)
    const kTuple = parseScsiTuple(k.scsiAddress)
    const vdIndex = parseVdIndex(ld.id)
    const targetMatchesVd = kTuple ? kTuple.target === vdIndex : false
    const hostMatchesControllerId = kTuple
      ? (!Number.isNaN(Number.parseInt(ctrl.id, 10)) && kTuple.host === Number.parseInt(ctrl.id, 10))
      : false
    const vendorModel = `${k.vendor} ${k.model}`.toLowerCase()
    const isPercLike = vendorModel.includes('dell') || vendorModel.includes('perc') || vendorModel.includes('megaraid')

    if (ld.scsiAddress && k.scsiAddress === ld.scsiAddress && sizeOk) {
      candidates.push({ path, method: 'lsscsi', scsiAddress: k.scsiAddress, sgPath: k.sgDevicePath, score: 100 })
      continue
    }
    if (sizeOk && targetMatchesVd && (isPercLike || !!dev)) {
      candidates.push({
        path,
        method: 'lsscsi',
        scsiAddress: k.scsiAddress,
        sgPath: k.sgDevicePath,
        score: hostMatchesControllerId ? 96 : 92,
      })
      continue
    }
    if (sizeOk && dev && isRaidExposedDisk(dev)) {
      candidates.push({ path, method: 'lsscsi', scsiAddress: k.scsiAddress, sgPath: k.sgDevicePath, score: 80 })
    }
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0]
  return best ? { path: best.path, method: best.method, scsiAddress: best.scsiAddress, sgPath: best.sgPath } : null
}

function matchFromBlockDevices(
  ld: HardwareRaidLogicalDrive,
  blockDevices: RaidBlockDevice[],
  used: Set<string>,
  diag: HwLdOsMappingDiagnostic,
): { path: string; method: HwLdOsMatchMethod } | null {
  const pool = blockDevices.filter(d => isRaidExposedDisk(d) && !used.has(d.path))

  for (const dev of pool) {
    if (!sizeMatch(ld.sizeBytes, dev.sizeBytes)) continue

    const ldWwn = wwnNorm(ld.wwn)
    const devWwn = wwnNorm(dev.wwn)
    if (ldWwn && devWwn && ldWwn === devWwn) {
      diag.candidateOsPaths.push({ path: dev.path, score: 95, reasons: ['WWN match'] })
      return { path: dev.path, method: 'size_wwn' }
    }

    const ldSer = serialNorm(ld.serial)
    const devSer = serialNorm(dev.serial ?? dev.idSerial)
    if (ldSer && devSer && ldSer === devSer) {
      diag.candidateOsPaths.push({ path: dev.path, score: 90, reasons: ['serial match'] })
      return { path: dev.path, method: 'size_serial' }
    }

    diag.candidateOsPaths.push({
      path: dev.path,
      score: 70,
      reasons: [`size ${dev.sizeBytes}`, dev.model ?? ''].filter(Boolean),
    })
  }

  const sizeMatches = pool.filter(d => sizeMatch(ld.sizeBytes, d.sizeBytes))
  if (sizeMatches.length === 1) {
    return { path: sizeMatches[0].path, method: 'size_vendor' }
  }

  return null
}

function matchFromMounts(
  ld: HardwareRaidLogicalDrive,
  mounts: FileSystemMount[],
  blockDevices: RaidBlockDevice[],
  used: Set<string>,
): { path: string; method: HwLdOsMatchMethod } | null {
  for (const m of mounts) {
    if (!m.mounted) continue
    const backing = m.linkedBackendPath ?? m.backingDevice
    const path = normalizeOsPath(backing)
    if (!path || used.has(path)) continue
    const dev = blockDevices.find(d => d.path === path || `/dev/${d.name}` === path)
    if (!dev || !isRaidExposedDisk(dev)) continue
    if (sizeMatch(ld.sizeBytes, dev.sizeBytes)) {
      return { path: dev.path, method: 'mount_backing' }
    }
  }
  return null
}

function orderedFallback(
  ld: HardwareRaidLogicalDrive,
  unmappedLds: HardwareRaidLogicalDrive[],
  kernelPool: KernelExposedLogicalDrive[],
  used: Set<string>,
): { path: string; method: HwLdOsMatchMethod } | null {
  const available = kernelPool
    .map(k => normalizeOsPath(k.devicePath))
    .filter((p): p is string => !!p && !used.has(p))

  if (unmappedLds.length !== available.length || available.length === 0) return null

  const sortedLds = [...unmappedLds].sort((a, b) => parseVdIndex(a.id) - parseVdIndex(b.id))
  const sortedPaths = [...available].sort()
  const idx = sortedLds.findIndex(l => l.id === ld.id)
  if (idx < 0 || idx >= sortedPaths.length) return null
  return { path: sortedPaths[idx], method: 'order' }
}

function enrichLogicalDrive(
  ld: HardwareRaidLogicalDrive,
  ctrl: HardwareRaidController,
  ctx: {
    kernelPool: KernelExposedLogicalDrive[]
    blockDevices: RaidBlockDevice[]
    mounts: FileSystemMount[]
    usedPaths: Set<string>
    unmappedInCtrl: HardwareRaidLogicalDrive[]
  },
): HardwareRaidLogicalDrive {
  const diag: HwLdOsMappingDiagnostic = {
    controllerId: ctrl.id,
    vdId: ld.id,
    sizeBytes: ld.sizeBytes,
    expectedIdentifiers: {
      wwn: ld.wwn,
      serial: ld.serial,
      scsiAddress: ld.scsiAddress,
      inquiry: ld.inquiry,
    },
    candidateOsPaths: [],
  }

  const existing = cliOsPath(ld)
  if (existing && !ctx.usedPaths.has(existing)) {
    ctx.usedPaths.add(existing)
    return {
      ...ld,
      device: existing,
      devicePath: existing,
      osDeviceSource: 'cli',
      osDevicePath: existing,
      scsiDevice: existing,
      sgPath: ld.osSgDevice,
      scsiHctl: ld.scsiAddress,
      osMappingStatus: 'mapped',
      osDeviceDetectionSource: 'cli',
      osDeviceConfidence: 'high',
      osMappingDiagnostic: {
        ...diag,
        matchedPath: existing,
        matchMethod: 'os_drive_name',
        mappingSource: 'cli',
        confidence: 'high',
      },
    }
  }

  const kernelHit = matchFromKernel(ctrl, ld, ctx.kernelPool, ctx.blockDevices, ctx.usedPaths)
  if (kernelHit) {
    const tuple = parseScsiTuple(kernelHit.scsiAddress)
    const vdIndex = parseVdIndex(ld.id)
    const mappedDev = ctx.blockDevices.find(d => d.path === kernelHit.path)
    const sizeKnown = !!ld.sizeBytes && !!mappedDev?.sizeBytes
    const sizeConsistent = sizeKnown ? sizeMatch(ld.sizeBytes, mappedDev?.sizeBytes) : false
    const confidence: 'high' | 'medium' | 'low' = tuple && tuple.target === vdIndex
      ? (sizeKnown ? (sizeConsistent ? 'high' : 'low') : 'medium')
      : (ld.sizeBytes ? 'medium' : 'low')
    ctx.usedPaths.add(kernelHit.path)
    return {
      ...ld,
      device: kernelHit.path,
      devicePath: kernelHit.path,
      osDeviceSource: 'lsscsi',
      osDevicePath: kernelHit.path,
      scsiDevice: kernelHit.path,
      sgPath: kernelHit.sgPath,
      osSgDevice: kernelHit.sgPath,
      scsiAddress: kernelHit.scsiAddress ?? ld.scsiAddress,
      scsiHctl: kernelHit.scsiAddress ?? ld.scsiAddress,
      detectionSource: ld.detectionSource ?? 'lsscsi',
      osMappingStatus: 'mapped',
      osDeviceDetectionSource: 'lsscsi',
      osDeviceConfidence: confidence,
      osMappingDiagnostic: {
        ...diag,
        matchedPath: kernelHit.path,
        matchMethod: kernelHit.method,
        mappingSource: 'lsscsi',
        mappedSgPath: kernelHit.sgPath,
        mappedScsiTuple: kernelHit.scsiAddress,
        confidence,
      },
    }
  }

  const blockHit = matchFromBlockDevices(ld, ctx.blockDevices, ctx.usedPaths, diag)
  if (blockHit) {
    ctx.usedPaths.add(blockHit.path)
    return {
      ...ld,
      device: blockHit.path,
      devicePath: blockHit.path,
      osDeviceSource: 'heuristic',
      osDevicePath: blockHit.path,
      scsiDevice: blockHit.path,
      osMappingStatus: 'mapped',
      osDeviceDetectionSource: 'heuristic',
      osDeviceConfidence: blockHit.method === 'size_wwn' || blockHit.method === 'size_serial' ? 'high' : 'medium',
      osMappingDiagnostic: {
        ...diag,
        matchedPath: blockHit.path,
        matchMethod: blockHit.method,
        mappingSource: 'heuristic',
        confidence: blockHit.method === 'size_wwn' || blockHit.method === 'size_serial' ? 'high' : 'medium',
      },
    }
  }

  const mountHit = matchFromMounts(ld, ctx.mounts, ctx.blockDevices, ctx.usedPaths)
  if (mountHit) {
    ctx.usedPaths.add(mountHit.path)
    return {
      ...ld,
      device: mountHit.path,
      devicePath: mountHit.path,
      osDeviceSource: 'heuristic',
      osDevicePath: mountHit.path,
      scsiDevice: mountHit.path,
      osMappingStatus: 'mapped',
      osDeviceDetectionSource: 'heuristic',
      osDeviceConfidence: 'medium',
      osMappingDiagnostic: {
        ...diag,
        matchedPath: mountHit.path,
        matchMethod: mountHit.method,
        mappingSource: 'heuristic',
        confidence: 'medium',
      },
    }
  }

  const orderHit = orderedFallback(ld, ctx.unmappedInCtrl, ctx.kernelPool, ctx.usedPaths)
  if (orderHit) {
    ctx.usedPaths.add(orderHit.path)
    diag.failureReason = 'Mapped by VD order vs SCSI disk order (low confidence)'
    return {
      ...ld,
      device: orderHit.path,
      devicePath: orderHit.path,
      osDeviceSource: 'heuristic',
      osDevicePath: orderHit.path,
      scsiDevice: orderHit.path,
      osMappingStatus: 'mapped',
      osDeviceDetectionSource: 'heuristic',
      osDeviceConfidence: 'low',
      osMappingDiagnostic: {
        ...diag,
        matchedPath: orderHit.path,
        matchMethod: orderHit.method,
        mappingSource: 'heuristic',
        confidence: 'low',
      },
      warnings: [...(ld.warnings ?? []), diag.failureReason],
    }
  }

  for (const dev of ctx.blockDevices.filter(isRaidExposedDisk)) {
    if (sizeMatch(ld.sizeBytes, dev.sizeBytes)) {
      diag.candidateOsPaths.push({
        path: dev.path,
        score: 40,
        reasons: ['size match only (already assigned or ambiguous)'],
      })
    }
  }

  diag.failureReason = diag.candidateOsPaths.length
    ? 'No unique match among candidates'
    : 'No PERC/MegaRAID block device in lsblk/lsscsi'

  return {
    ...ld,
    osMappingStatus: 'unmapped',
    osMappingDiagnostic: diag,
  }
}

export function enrichHardwareLdOsPaths(input: HwLdOsMappingInput): HardwareRaidController[] {
  const singleController = input.controllers.length === 1
  const mounts = input.mounts ?? []

  return input.controllers.map((ctrl) => {
    const kernelPool = kernelDrivesForController(ctrl, input.kernelLogicalDrives, singleController)
    const usedPaths = new Set<string>()

    const pass1 = ctrl.logicalDrives.map(ld =>
      enrichLogicalDrive(ld, ctrl, {
        kernelPool,
        blockDevices: input.blockDevices,
        mounts,
        usedPaths,
        unmappedInCtrl: ctrl.logicalDrives.filter(l => !cliOsPath(l)),
      }),
    )

    const unmapped = pass1.filter(ld => ld.osMappingStatus !== 'mapped')
    if (unmapped.length <= 1) {
      return { ...ctrl, logicalDrives: pass1 }
    }

    const pass2 = pass1.map(ld => {
      if (ld.osMappingStatus === 'mapped') return ld
      return enrichLogicalDrive(ld, ctrl, {
        kernelPool,
        blockDevices: input.blockDevices,
        mounts,
        usedPaths,
        unmappedInCtrl: unmapped,
      })
    })

    return { ...ctrl, logicalDrives: pass2 }
  })
}

export function hasRaidCliTool(tools: RaidToolsInfo): boolean {
  return Boolean(tools.perccli || tools.storcli || tools.MegaCli64)
}

/** i18n key or legacy French string for FS/LVM reason lists */
export function hwLdUnmappedReasonKey(tools: RaidToolsInfo): string {
  return hasRaidCliTool(tools)
    ? 'storage.fs.hw_ld.mapping_not_found'
    : 'storage.fs.hw_ld.tool_missing'
}
