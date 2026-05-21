/**
 * File systems and FILEIO / vdisk provisioning (shared client + server).
 */

export type FsType = 'xfs' | 'ext4'
export type FsBackendKind = 'lvm_lv' | 'md' | 'hw_raid_ld' | 'disk'
export type VdiskAllocMode = 'fallocate' | 'dd'
export type PartitionStrategy = 'none' | 'gpt'

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
  partition?: string
  fsType: FsType | string
  label?: string
  uuid?: string
  totalBytes: number
  freeBytes: number
  usedPct: number
  mounted: boolean
  fstabEntry?: string
  source: 'findmnt' | 'df' | 'fstab'
}

export interface VDiskFile {
  path: string
  fileName: string
  sizeBytes: number
  mountPoint: string
  scstDeviceNames: string[]
  mapped: boolean
}

export interface FsBackendCandidate {
  path: string
  kind: FsBackendKind
  sizeBytes: number
  eligible: boolean
  reasons: string[]
  displayName?: string
}

export interface FsOverview {
  scannedAt: number
  mounts: FileSystemMount[]
  vdiskFiles: VDiskFile[]
  tools: FsToolsInfo
}

export interface FsPreflightResult {
  ok: boolean
  configPreview: string[]
  commands: string[]
  warnings: string[]
  blockers: string[]
  requiredConfirmation?: string
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
