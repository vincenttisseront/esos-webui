/**
 * LVM management types (client + shared contracts).
 */
import type { MdArray, RaidBlockDevice } from './raid'

export type LvmRiskLevel = 'safe' | 'risky' | 'destructive'
export type LvmAction =
  | 'pvcreate'
  | 'vgcreate'
  | 'lvcreate'
  | 'pvremove'
  | 'vgremove'
  | 'lvremove'
  | 'bind_scst'

export type LvmCandidateKind = 'disk' | 'part' | 'md' | 'hw_raid_ld' | 'unknown'
export type LvmUsedBy = 'filesystem' | 'md' | 'lvm' | 'scst' | 'mounted' | 'unknown_signature'

export interface LvmToolsInfo {
  pvs: boolean
  vgs: boolean
  lvs: boolean
  pvcreate: boolean
  vgcreate: boolean
  lvcreate: boolean
  vgremove: boolean
  lvremove: boolean
  pvremove: boolean
  wipefs: boolean
  blkid: boolean
  clvmd?: boolean
}

export interface PhysicalVolume {
  path: string
  vgName: string
  sizeBytes: number
  freeBytes: number
  uuid: string
  devSizeBytes?: number
  peSizeBytes?: number
  attr?: string
  usedBy: LvmUsedBy[]
}

export interface VolumeGroup {
  name: string
  uuid: string
  sizeBytes: number
  freeBytes: number
  pvCount: number
  lvCount: number
  attr?: string
  clustered: boolean
}

export type LvScstBindingState = 'none' | 'linked' | 'partial'

export interface LvScstNodeBinding {
  nodeSanId: string
  nodeLabel: string
  state: 'linked' | 'missing'
  deviceNames: string[]
}

export interface LvScstBinding {
  state: LvScstBindingState
  deviceNames: string[]
  perNode?: LvScstNodeBinding[]
}

export interface LogicalVolume {
  name: string
  /** Block device path used for SCST / validation (resolved backing path). */
  path: string
  /** Human-readable LV id (vg/lv). */
  displayName: string
  /** Alternate paths (mapper, legacy, LVM report) for SCST matching and preflight. */
  pathCandidates?: string[]
  vgName: string
  sizeBytes: number
  uuid: string
  attr?: string
  active: boolean
  usedBy: LvmUsedBy[]
  /** SCST devices bound to this LV (path-matched). */
  scstDeviceNames?: string[]
  /** Rich SCST linkage (path + optional per-node state in cluster views). */
  scst?: LvScstBinding
}

export interface LvmCandidateDevice {
  path: string
  stableId?: string
  kind: LvmCandidateKind
  sizeBytes: number
  eligible: boolean
  reasons: string[]
  usedBy: LvmUsedBy[]
  signatures: string[]
  model?: string
  serial?: string
  /** Hardware RAID logical drive id (e.g. 0/vd1). */
  hwLdId?: string
  controllerId?: string
}

export interface LvmAlert {
  severity: 'info' | 'warning' | 'critical'
  message: string
  code?: string
  params?: Record<string, string | number>
}

export interface LvmNodeSnapshot {
  nodeSanId: string
  nodeLabel: string
  pvs: PhysicalVolume[]
  vgs: VolumeGroup[]
  lvs: LogicalVolume[]
  candidates?: LvmCandidateDevice[]
}

export interface ClusterLvmNodeInventory {
  sanId: string
  label: string
  role: string | null
  readOnly: boolean
  sshReady: boolean
  error?: string
  overview: LvmOverviewResponse
  mdArrayNames: string[]
  mdArrays?: MdArray[]
  blockDevices?: RaidBlockDevice[]
}

export interface LocalSymmetricLvmIssue {
  vgName?: string
  lvName?: string
  message: string
  severity: 'warning' | 'critical'
}

export interface ClusterLvmPreflightPerNode {
  sanId: string
  label: string
  ok: boolean
  blockers: string[]
  warnings: string[]
  error?: string
}

export interface ClusterLvmPreflightResult {
  ok: boolean
  blockers: string[]
  warnings: string[]
  mappings: ClusterLvmDiskMapping[]
  symmetryIssues: Array<{ vgName?: string; lvName?: string; message: string; severity: 'warning' | 'critical' }>
  nodes: ClusterLvmNodeInventory[]
  perNode?: ClusterLvmPreflightPerNode[]
}

export interface ClusterLvmExecutionResult {
  success: boolean
  action: LvmAction
  clusterId?: string
  primarySanId: string
  nodeResults: ClusterLvmNodeResult[]
  refreshedSanIds: string[]
  errors: string[]
}

export interface LvmOverviewResponse {
  scannedAt: number
  tools: LvmToolsInfo
  pvs: PhysicalVolume[]
  vgs: VolumeGroup[]
  lvs: LogicalVolume[]
  candidates: LvmCandidateDevice[]
  pendingHwRaidBackends?: import('~/utils/hw-raid-pending-backend').PendingHwRaidBackend[]
  alerts: LvmAlert[]
  clusterLvmDetection?: LvmNodeSnapshot[]
}

export interface LvmPreflightResult {
  ok: boolean
  blockers: string[]
  warnings: string[]
  riskLevel: LvmRiskLevel
  requiredConfirmation: string
  impactedDevices: string[]
  commandPreview?: string
}

export interface PvCreatePayload {
  path: string
  force?: boolean
  confirmation: string
}

export interface VgCreatePayload {
  name: string
  pvPaths: string[]
  confirmation: string
}

export interface LvCreatePayload {
  vgName: string
  name: string
  sizeBytes: number
  confirmation: string
}

export interface PvRemovePayload {
  path: string
  confirmation: string
}

export interface VgRemovePayload {
  name: string
  confirmation: string
}

export interface LvRemovePayload {
  vgName: string
  name: string
  confirmation: string
}

export interface BindScstPayload {
  vgName: string
  lvName: string
  deviceName: string
  confirmation: string
}

export interface LvmPreflightRequest {
  action: LvmAction
  payload: PvCreatePayload | VgCreatePayload | LvCreatePayload | PvRemovePayload | VgRemovePayload | LvRemovePayload | BindScstPayload
  clusterExecution?: ClusterLvmExecutionRequest
}

export interface ClusterLvmExecutionRequest {
  primarySanId: string
  clusterId?: string
  requirePreflightOk?: boolean
  diskMappings?: ClusterLvmDiskMapping[]
}

export interface ClusterLvmDiskMapping {
  sourceSanId: string
  peerSanId: string
  sourcePath: string
  peerPath: string
  stableKey?: string
}

export interface ClusterLvmNodeResult {
  sanId: string
  label: string
  participation: 'execute' | 'skip' | 'failed'
  command?: string
  exitCode?: number
  stdout?: string
  stderr?: string
  error?: string
}

export interface ClusterLvmExecutionPlan {
  action: LvmAction
  clusterId?: string
  primarySanId: string
  confirmationPhrase: string
  nodeResults: ClusterLvmNodeResult[]
  okSymmetric: boolean
  warnings: string[]
  blockers: string[]
}
