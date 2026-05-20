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

export interface LogicalVolume {
  name: string
  path: string
  vgName: string
  sizeBytes: number
  uuid: string
  attr?: string
  active: boolean
  usedBy: LvmUsedBy[]
  scstDeviceNames?: string[]
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
}

export interface LvmAlert {
  severity: 'info' | 'warning' | 'critical'
  message: string
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

export interface ClusterLvmPreflightResult {
  ok: boolean
  blockers: string[]
  warnings: string[]
  mappings: ClusterLvmDiskMapping[]
  symmetryIssues: Array<{ vgName?: string; message: string; severity: 'warning' | 'critical' }>
  nodes: ClusterLvmNodeInventory[]
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
