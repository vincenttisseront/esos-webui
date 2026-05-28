import type { FileioDeviceRef, FsOverview, ScstLunMappingRef, VDiskFile } from '~/types/filesystem'
import type { FileioInventory } from '~/utils/fs-fileio-inventory'
import type { ProvisioningStepStatus } from '~/utils/lvm-provisioning-chain'

export interface FileioChainAggregate {
  mountPoint: string | null
  vdiskTotal: number
  vdiskRegistered: number
  fileioOnMount: FileioDeviceRef[]
  fileioMapped: number
  lunMappings: ScstLunMappingRef[]
}

export function pathOnMount(path: string, mountPoint: string): boolean {
  return path === mountPoint || path.startsWith(`${mountPoint}/`)
}

export function scopeInventoryToMount(
  inventory: FileioInventory,
  mountPoint: string,
): FileioInventory {
  const vdiskFiles = inventory.vdiskFiles.filter(
    v => v.mountPoint === mountPoint || pathOnMount(v.path, mountPoint),
  )
  const fileioDevices = inventory.fileioDevices.filter(
    d => d.filename && pathOnMount(d.filename, mountPoint),
  )
  const deviceNames = new Set(fileioDevices.map(d => d.name))
  const lunMappings = inventory.lunMappings.filter(
    l => deviceNames.has(l.deviceName)
      || (l.filename && pathOnMount(l.filename, mountPoint)),
  )
  return { ...inventory, vdiskFiles, fileioDevices, lunMappings }
}

export function vdiskHasFileioDevice(v: VDiskFile, devices: FileioDeviceRef[]): boolean {
  if (v.scstDeviceNames.length > 0) return true
  if (v.fileioDeviceName) return true
  return devices.some(d => d.filename === v.path)
}

export function fileioDeviceMapped(
  device: FileioDeviceRef,
  lunMappings: ScstLunMappingRef[],
): boolean {
  if (device.mapped) return true
  return lunMappings.some(l => l.deviceName === device.name)
}

export function computeFileioChainAggregate(
  inventory: FileioInventory,
  mountPoint: string | null,
): FileioChainAggregate {
  const scoped = mountPoint ? scopeInventoryToMount(inventory, mountPoint) : inventory
  const vdiskTotal = scoped.vdiskFiles.length
  const fileioOnMount = scoped.fileioDevices
  const vdiskRegistered = scoped.vdiskFiles.filter(v => vdiskHasFileioDevice(v, fileioOnMount)).length
  const fileioMapped = fileioOnMount.filter(d => fileioDeviceMapped(d, scoped.lunMappings)).length

  return {
    mountPoint,
    vdiskTotal,
    vdiskRegistered,
    fileioOnMount,
    fileioMapped,
    lunMappings: scoped.lunMappings,
  }
}

export interface ChainStepDetail {
  detail: string
  detailKey?: string
  detailParams?: Record<string, string>
}

const DASH: ChainStepDetail = { detail: '—', detailKey: 'storage.fs.chain.detail.dash' }

export function buildVdiskStepDetailFromFiles(
  vdisks: VDiskFile[],
  agg: FileioChainAggregate,
): ChainStepDetail {
  if (agg.vdiskTotal === 0) {
    return { detail: '—', detailKey: 'storage.fs.chain.detail.no_vdisk' }
  }
  if (agg.vdiskTotal === 1) {
    const name = vdisks[0]?.fileName ?? vdisks[0]?.path.split('/').pop() ?? '—'
    return {
      detail: name,
      detailKey: 'storage.fs.chain.detail.vdisk_single',
      detailParams: { name },
    }
  }
  return {
    detail: `${agg.vdiskTotal} vdisk files`,
    detailKey: 'storage.fs.chain.detail.vdisk_multiple',
    detailParams: { count: String(agg.vdiskTotal) },
  }
}

export function buildFileioStepDetail(
  agg: FileioChainAggregate,
  vdisks: VDiskFile[],
): ChainStepDetail {
  if (agg.vdiskTotal === 0) return DASH

  if (agg.vdiskTotal === 1) {
    const v = vdisks[0]
    const device = agg.fileioOnMount.find(d => d.filename === v?.path)
      ?? (v?.fileioDeviceName
        ? agg.fileioOnMount.find(d => d.name === v.fileioDeviceName)
        : undefined)
      ?? (v?.scstDeviceNames[0]
        ? agg.fileioOnMount.find(d => d.name === v.scstDeviceNames[0])
        : undefined)
    if (device) {
      return {
        detail: device.name,
        detailKey: 'storage.fs.chain.detail.fileio_single',
        detailParams: { name: device.name },
      }
    }
    return { detail: 'Missing', detailKey: 'storage.fs.chain.detail.fileio_single_missing' }
  }

  const total = agg.vdiskTotal
  const registered = agg.vdiskRegistered
  if (registered === 0) {
    return {
      detail: '0 devices registered',
      detailKey: 'storage.fs.chain.detail.fileio_none_registered',
      detailParams: { total: String(total) },
    }
  }
  if (registered === total) {
    return {
      detail: `${registered} devices registered`,
      detailKey: 'storage.fs.chain.detail.fileio_all_registered',
      detailParams: { count: String(registered) },
    }
  }
  return {
    detail: `${registered} of ${total} devices registered`,
    detailKey: 'storage.fs.chain.detail.fileio_partial',
    detailParams: { registered: String(registered), total: String(total) },
  }
}

export function buildExposeStepDetail(agg: FileioChainAggregate): ChainStepDetail {
  if (agg.vdiskTotal === 0) return DASH

  const total = agg.fileioOnMount.length || agg.vdiskRegistered
  const mapped = agg.fileioMapped

  if (total <= 1) {
    const lun = agg.lunMappings[0]
    if (lun && mapped > 0) {
      const detail = `${lun.targetName} LUN ${lun.lunId}`
      return {
        detail,
        detailKey: 'storage.fs.chain.detail.expose_single',
        detailParams: { target: lun.targetName, lun: String(lun.lunId) },
      }
    }
    return {
      detail: '0 LUNs mapped',
      detailKey: 'storage.fs.chain.detail.expose_none',
    }
  }

  if (mapped === 0) {
    return {
      detail: '0 LUNs mapped',
      detailKey: 'storage.fs.chain.detail.expose_none',
      detailParams: { total: String(total) },
    }
  }
  if (mapped === total) {
    return {
      detail: `${mapped} LUNs`,
      detailKey: 'storage.fs.chain.detail.expose_all',
      detailParams: { count: String(mapped) },
    }
  }
  return {
    detail: `${mapped} of ${total} LUNs`,
    detailKey: 'storage.fs.chain.detail.expose_partial',
    detailParams: { mapped: String(mapped), total: String(total) },
  }
}

export function vdiskStepStatus(
  agg: FileioChainAggregate,
  dataMounts: number,
  blockioOnly: boolean,
): ProvisioningStepStatus {
  if (agg.vdiskTotal > 0) {
    return agg.vdiskRegistered < agg.vdiskTotal ? 'next' : 'created'
  }
  if (dataMounts > 0) return 'next'
  if (blockioOnly) return 'optional'
  return 'missing'
}

export function fileioStepStatus(
  agg: FileioChainAggregate,
  blockioOnly: boolean,
): ProvisioningStepStatus {
  if (agg.vdiskTotal === 0) {
    return blockioOnly ? 'optional' : 'missing'
  }
  if (agg.vdiskRegistered === 0) return 'next'
  if (agg.vdiskRegistered < agg.vdiskTotal) return 'next'
  if (agg.fileioMapped < agg.fileioOnMount.length) return 'created'
  return 'created'
}

export function exposeStepStatus(
  agg: FileioChainAggregate,
  blockioOnly: boolean,
): ProvisioningStepStatus {
  const total = agg.fileioOnMount.length
  if (total === 0) {
    if (agg.vdiskTotal === 0) return blockioOnly ? 'optional' : 'missing'
    if (agg.vdiskRegistered === 0) return 'missing'
    return 'next'
  }
  if (agg.fileioMapped === 0) return 'next'
  if (agg.fileioMapped < total) return 'next'
  return 'created'
}

/** Vdisks and fileio scoped to the active FILEIO mount. */
export function activeMountScopedSlices(
  overview: FsOverview,
  mountPoint: string | null,
): { vdisks: VDiskFile[]; fileioDevices: FileioDeviceRef[] } {
  if (!mountPoint) {
    return { vdisks: overview.vdiskFiles, fileioDevices: overview.fileioDevices }
  }
  const vdisks = overview.vdiskFiles.filter(
    v => v.mountPoint === mountPoint || pathOnMount(v.path, mountPoint),
  )
  const fileioDevices = overview.fileioDevices.filter(
    d => d.filename && pathOnMount(d.filename, mountPoint),
  )
  return { vdisks, fileioDevices }
}
