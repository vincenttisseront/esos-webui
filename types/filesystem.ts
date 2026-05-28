/**
 * File systems and FILEIO / vdisk provisioning (shared client + server).
 */

export type FsType = 'xfs' | 'ext4'
export type FsBackendKind = 'lvm_lv' | 'md' | 'hw_raid_ld' | 'disk'
export type VdiskAllocMode = 'fallocate' | 'dd'
export type PartitionStrategy = 'none' | 'gpt'
export type MountStatus = 'mounted' | 'unmounted' | 'unknown'
export type MountHealth = 'ok' | 'degraded' | 'full'
export type FsMountRole = 'fileio_data' | 'system' | 'other'
export type FsBackendSource = 'hw_raid' | 'md' | 'lvm_lv' | 'disk'
export type VdiskFileSource = 'scan' | 'scst_config' | 'scst_sysfs'
export type FsResourceKind = 'backend' | 'mount' | 'vdisk' | 'fileio' | 'lun'
export type FsResourceRelation = 'backs' | 'hosts' | 'registers' | 'exposes'

export interface FsToolsInfo {
  mkfs_xfs: boolean
  mkfs_ext4: boolean
  parted: boolean
  fallocate: boolean
  df: boolean
  findmnt: boolean
  blkid: boolean
}

export interface FileSystemMount {
  mountPoint: string
  backingDevice: string
  backingPaths?: string[]
  linkedBackendPath?: string
  role?: FsMountRole
  partition?: string
  fsType: FsType | string
  label?: string
  uuid?: string
  totalBytes: number
  freeBytes: number
  usedPct: number
  mounted: boolean
  status: MountStatus
  health?: MountHealth
  fstabEntry?: string
  source: 'findmnt' | 'df' | 'fstab' | 'lsblk'
}

export interface VDiskFile {
  path: string
  fileName: string
  sizeBytes: number
  mountPoint: string
  scstDeviceNames: string[]
  mapped: boolean
  source?: VdiskFileSource
  fileioDeviceName?: string
}

export interface FileioDeviceRef {
  name: string
  handler: 'vdisk_fileio'
  filename: string
  attrs: Record<string, string>
  mapped: boolean
  sysfsPresent?: boolean
}

export interface ScstLunMappingRef {
  targetName: string
  groupName: string
  lunId: number
  deviceName: string
  handler: string
  filename: string
  readOnly: boolean
  /** Initiators from the SCST group (when LUN is under a group). */
  initiators?: string[]
}

export type FsNextActionKind = 'create_fs' | 'create_vdisk' | 'bind_fileio' | 'expose' | 'none'

export interface FsNextActionHint {
  kind: FsNextActionKind
  messageKey: string
  messageParams?: Record<string, string>
  mountPoint?: string
}

export interface FsBackendCandidate {
  path: string
  kind: FsBackendKind
  sizeBytes: number
  eligible: boolean
  reasons: string[]
  displayName?: string
}

/** Unified backend row (candidates + linkage metadata). */
export interface FsBackendRef extends FsBackendCandidate {
  source: FsBackendSource
  hwLdId?: string
  controllerLabel?: string
  mountPoint?: string
  scstDeviceNames?: string[]
  signatures?: string[]
}

export interface FsResourceLink {
  from: FsResourceKind
  fromId: string
  to: FsResourceKind
  toId: string
  relation: FsResourceRelation
}

export interface FsScanError {
  scanner: string
  message: string
}

export interface FsDetectionDiagnostics {
  mountCounts: {
    findmnt: number
    lsblk: number
    df: number
    fileioData: number
    system: number
    other: number
  }
  scst: {
    configBytes: number
    handlers: number
    fileioDevices: number
    lunMappings: number
    sysfsDevices: number
  }
  vdiskFiles?: number
  candidates: {
    total: number
    eligible: number
    byKind: Partial<Record<FsBackendKind, number>>
  }
  vdiskScanRoots: string[]
  excludedMounts: string[]
  warnings: string[]
}

export interface FsOverview {
  scannedAt: number
  mounts: FileSystemMount[]
  vdiskFiles: VDiskFile[]
  fileioDevices: FileioDeviceRef[]
  lunMappings: ScstLunMappingRef[]
  backends: FsBackendRef[]
  pendingHwRaidBackends?: import('~/utils/hw-raid-pending-backend').PendingHwRaidBackend[]
  links: FsResourceLink[]
  diagnostics: FsDetectionDiagnostics
  tools: FsToolsInfo
  nextAction: FsNextActionHint
  scanWarnings: string[]
  /** Non-fatal scanner notices (also surfaced as `warnings` in API docs). */
  warnings?: string[]
  /** Fatal per-scanner failures; overview may still be `partial`. */
  errors?: FsScanError[]
  /** True when one or more scanners failed but some inventory was collected. */
  partial?: boolean
  /** @deprecated use backends — kept for wizard compatibility */
  candidates?: FsBackendCandidate[]
  /** ESOS system volume protection snapshot (from RAID scan). */
  systemProtection?: import('~/utils/esos-system-protection').EsosSystemProtectionOverview
}

export type FileioBindConflictCode =
  | 'device_name_exists'
  | 'vdisk_file_already_fileio'
  | 'vdisk_already_mapped'
  | 'vdisk_not_found'
  | 'invalid_device_name'
  | 'scst_config_unavailable'
  | 'san_read_only'

export interface FileioBindExistingMapping {
  targetName: string
  groupName: string
  lunId: number
}

/** Structured FILEIO registration conflict returned with HTTP 409. */
export interface FileioBindConflict {
  code: FileioBindConflictCode
  message: string
  deviceName?: string
  filePath?: string
  existingDeviceName?: string
  existingMapping?: FileioBindExistingMapping | null
  mapped?: boolean
}

export interface FsPreflightResult {
  ok: boolean
  configPreview: string[]
  commands: string[]
  warnings: string[]
  blockers: string[]
  requiredConfirmation?: string
  conflict?: FileioBindConflict
}

export interface CreateFsPayload {
  backendPath: string
  fsType: FsType
  label: string
  mountPoint: string
  partitionStrategy?: PartitionStrategy
  confirmation?: string
}

export interface CreateVdiskPayload {
  mountPoint: string
  fileName: string
  sizeBytes: number
  allocMode?: VdiskAllocMode
  confirmation?: string
}

export interface CreateFileioPayload {
  deviceName: string
  vdiskPath: string
  nvCache?: boolean
  confirmation?: string
}

export interface FsNextAction {
  route: string
  query?: Record<string, string>
}
