/**
 * Types client pour le module RAID Management (SDD v3.12).
 * Re-export des interfaces partagées entre frontend et server.
 */
export type RaidBackendType = 'hardware' | 'software_md'
export type RaidVendor = 'lsi_megaraid' | 'dell_perc' | 'adaptec_aacraid' | 'unknown'
export type RaidHealth = 'ok' | 'warning' | 'critical' | 'rebuilding' | 'unknown'
export type RaidOperationStatus = 'planned' | 'running' | 'success' | 'warning' | 'failed' | 'cancelled'
export type RaidRiskLevel = 'read_only' | 'safe' | 'risky' | 'destructive'
export type RaidControllerMode = 'raid' | 'hba' | 'mixed' | 'unknown'

export interface RaidControllerModeDetection {
  mode: RaidControllerMode
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
}

export interface RaidBlockDevice {
  name: string
  path: string
  sizeBytes: number
  type: 'disk' | 'part' | 'raid' | 'lvm' | 'rom' | 'unknown'
  model?: string
  serial?: string
  wwn?: string
  byIdPaths?: string[]
  idSerial?: string
  idModel?: string
  idPath?: string
  vendor?: string
  transport?: string
  rotational?: boolean
  label?: string
  mountpoint?: string
  fstype?: string
  uuid?: string
  parent?: string
  partitionType?: string
  partitionTypeCode?: string
  partitionTypeName?: string
  hasMdSuperblock?: boolean
  mdExamine?: MdExamineInfo
  wipefsSignatures?: string[]
  blkidType?: string
  mdEligibilityReasons: string[]
  eligibleForMdPartitionPrep: boolean
  mdPartitionPrepReasons: string[]
  childrenPaths?: string[]
  diskSignatures?: string[]
  partitionTableType?: 'gpt' | 'dos' | 'unknown'
  usedBy: Array<'filesystem' | 'md' | 'lvm' | 'scst' | 'hardware_raid' | 'mounted' | 'unknown_signature'>
  eligibleForMd: boolean
  eligibleForHardwareRaid: boolean
  warnings: string[]
}

export interface MdExamineInfo {
  uuid?: string
  name?: string
  raidLevel?: string
  raidDevices?: number
  events?: number
  state?: string
  raw?: string
}

export interface HardwareRaidController {
  id: string
  vendor: RaidVendor
  model: string
  serial?: string
  firmware?: string
  driver?: string
  pciAddress?: string
  pciRawLine?: string
  cliTool: 'storcli' | 'perccli' | 'MegaCli64' | 'arcconf' | 'none'
  cliPath?: string
  detectionSource: Array<'cli' | 'lspci' | 'dmesg' | 'lsscsi'>
  managementMode: 'full' | 'read_only_limited' | 'unavailable'
  health: RaidHealth
  controllerMode?: RaidControllerModeDetection
  supportsCreate: boolean
  supportsDelete: boolean
  supportsHotSpare: boolean
  physicalDrives: HardwareRaidPhysicalDrive[]
  logicalDrives: HardwareRaidLogicalDrive[]
  warnings: string[]
}

export interface HardwareRaidPhysicalDrive {
  controllerId: string
  enclosure?: string
  slot: string
  did?: string
  state: 'unconfigured_good' | 'online' | 'hotspare' | 'failed' | 'rebuild' | 'foreign' | 'unknown'
  sizeBytes: number
  mediaType?: 'HDD' | 'SSD' | 'NVMe' | 'unknown'
  interfaceType?: string
  model?: string
  serial?: string
  firmware?: string
  temperatureC?: number
  eligible: boolean
  warnings: string[]
}

export interface HardwareRaidLogicalDrive {
  controllerId: string
  id: string
  name?: string
  raidLevel: '0' | '1' | '5' | '6' | '10' | '50' | '60' | 'unknown'
  sizeBytes?: number
  state: 'optimal' | 'degraded' | 'rebuilding' | 'failed' | 'offline' | 'unknown'
  cachePolicy?: string
  readPolicy?: string
  writePolicy?: string
  devicePath?: string
  scsiDevice?: string
  scsiAddress?: string
  scsiModel?: string
  detectionSource?: 'cli' | 'lsscsi' | 'dmesg' | 'proc_scsi'
  progressPct?: number
  warnings?: string[]
}

export type StoppedMdMemberStatus =
  | 'md_superblock_detected'
  | 'member_available'
  | 'member_missing'
  | 'orphan_metadata'
  | 'incomplete'

export interface StoppedMdArrayMember {
  path: string
  role?: string
  slot?: number
  mdExamine?: MdExamineInfo
  present: boolean
  memberStatus: StoppedMdMemberStatus
}

export interface StoppedMdArray {
  name: string
  path?: string
  uuid?: string
  raidLevel: MdArray['raidLevel']
  raidDevices: number
  metadataVersion?: string
  members: StoppedMdArrayMember[]
  stoppedState: 'stopped' | 'assemblable' | 'incomplete' | 'ambiguous'
  scanLine?: string
  warnings: string[]
  detectedOn: 'examine' | 'scan' | 'both'
}

export interface MdArray {
  name: string
  path: string
  uuid?: string
  metadataVersion?: string
  detailState?: string
  nameFromMdadm?: string
  syncAction?: MdProgress['action']
  raidLevel: '0' | '1' | '4' | '5' | '6' | '10' | 'linear' | 'unknown'
  state: 'active' | 'inactive' | 'clean' | 'degraded' | 'recovering' | 'resync' | 'failed' | 'unknown'
  sizeBytes?: number
  chunkKb?: number
  raidDevices: number
  activeDevices: number
  workingDevices: number
  failedDevices: number
  spareDevices: number
  members: MdMemberDevice[]
  progress?: MdProgress
  usedBy: Array<'filesystem' | 'lvm' | 'scst' | 'mounted'>
  warnings: string[]
}

export interface MdMemberDevice {
  path?: string
  role?: number
  slot?: number
  major?: number
  minor?: number
  raidDevice?: number
  arrayUuid?: string
  state: Array<'active' | 'sync' | 'faulty' | 'spare' | 'removed' | 'rebuilding'>
  events?: number
}

export interface MdProgress {
  action: 'resync' | 'recovery' | 'reshape' | 'check' | 'repair'
  percent: number
  finishEta?: string
  speedKbps?: number
}

export interface RaidOperation {
  id: string
  sanId: string
  backend: RaidBackendType
  action: string
  riskLevel: RaidRiskLevel
  status: RaidOperationStatus
  createdAt: number
  startedAt?: number
  finishedAt?: number
  createdBy: string
  summary: string
  preflight: RaidPreflightResult
  steps: RaidOperationStep[]
  error?: string
}

export interface RaidOperationStep {
  id: string
  label: string
  command?: string
  status: RaidOperationStatus
  stdoutPreview?: string
  stderrPreview?: string
  startedAt?: number
  finishedAt?: number
}

export interface RaidPreflightResult {
  ok: boolean
  riskLevel: RaidRiskLevel
  blockers: string[]
  warnings: string[]
  requiredConfirmation: string
  impactedDevices: string[]
  detectedUsage: Record<string, string[]>
  commandPreview?: string
  partitionTableRequested?: 'auto' | 'gpt' | 'dos'
  partitionTableResolved?: 'gpt' | 'dos'
  candidateChecks?: MdCandidateCheck[]
  diskChecks?: MdPartitionDiskCheck[]
  preparedPartitionPreview?: PreparedMdPartitionPreview[]
}

export interface MdCandidateCheck {
  path: string
  eligible: boolean
  reasons: string[]
  partitionType?: string
  partitionTypeName?: string
  hasMdSuperblock?: boolean
  signatures?: string[]
}

export interface MdPartitionDiskCheck {
  path: string
  eligible: boolean
  sizeBytes: number
  signatures: string[]
  hasChildren: boolean
  childrenPaths: string[]
  willOverwritePartitionTable: boolean
  reasons: string[]
  expectedPartitionPath?: string
}

export interface PreparedMdPartitionPreview {
  disk: string
  expectedPartitionPath: string
}

export type ClusterStorageAction = 'prepare_md_partitions' | 'create_md'
export type ClusterDiskMappingConfidence = 'high' | 'medium' | 'low' | 'none'

export interface ClusterDiskMappingInput {
  sourcePath: string
  targetSanId: string
  targetPath: string
  confirmedBy?: 'operator' | 'derived_from_operator_disk_mapping'
  sourceKind?: 'disk' | 'partition'
}

export interface ClusterDiskMappingCandidate {
  path: string
  confidence: Extract<ClusterDiskMappingConfidence, 'medium' | 'low'>
  evidence: string[]
  warnings: string[]
}

export interface ClusterDiskMapping {
  sourcePath: string
  targetSanId: string
  targetPath?: string
  confidence: ClusterDiskMappingConfidence
  evidence: string[]
  warnings: string[]
  blockers: string[]
  candidates?: ClusterDiskMappingCandidate[]
}

export interface ClusterStorageNodeInventory {
  sanId: string
  label: string
  role: string | null
  readOnly: boolean
  sshReady: boolean
  error?: string
  tools?: RaidOverviewResponse['tools']
  blockDevices: RaidBlockDevice[]
  mdArrays: MdArray[]
}

export interface ClusterStoragePreflightRequest {
  clusterId?: string
  nodeIds?: string[]
  primarySanId: string
  action: ClusterStorageAction
  payload: unknown
  diskMappings?: ClusterDiskMappingInput[]
}

export interface ClusterStoragePreflightResult {
  ok: boolean
  action: ClusterStorageAction
  sourceSanId: string
  blockers: string[]
  warnings: string[]
  syncLimitations: string[]
  nodes: ClusterStorageNodeInventory[]
  mappings: ClusterDiskMapping[]
  perNodePreflights: Record<string, RaidPreflightResult>
  executionModesAllowed: Array<'primary_only_with_warning' | 'all_nodes' | 'staged'>
}

export interface PrepareMdPartitionsClusterExecutionRequest {
  clusterId?: string
  primarySanId: string
  diskMappings?: ClusterDiskMappingInput[]
  requirePreflightOk: true
  stopOnFirstFailure?: true
}

export interface PrepareMdPartitionsNodePlan {
  sanId: string
  label: string
  role: string | null
  source: 'primary' | 'peer'
  disks: string[]
  commands: string[]
  preparedPartitions: string[]
  preflight: RaidPreflightResult
  status: 'pending' | 'running' | 'success' | 'failed'
  stdout?: string
  stderr?: string
  error?: string
}

export interface PrepareMdPartitionsClusterExecutionResult {
  mode: 'cluster'
  clusterId?: string
  sourceSanId: string
  stopOnFirstFailure: true
  nodePlans: PrepareMdPartitionsNodePlan[]
  failedSanId?: string
  refreshedSanIds?: string[]
}

export interface CreateMdArrayClusterExecutionRequest {
  clusterId?: string
  primarySanId: string
  diskMappings?: ClusterDiskMappingInput[]
  requirePreflightOk: true
  stopOnFirstFailure?: true
}

export interface CreateMdArrayNodeResult {
  sanId: string
  label: string
  role: string | null
  source: 'primary' | 'peer'
  devices: string[]
  command?: string
  status: 'pending' | 'running' | 'success' | 'failed'
  stdout?: string
  stderr?: string
  persisted?: boolean
  error?: string
}

export interface CreateMdArrayExecutionPlan {
  mode: 'standalone' | 'cluster'
  sourceSanId: string
  clusterId?: string
  nodeResults: CreateMdArrayNodeResult[]
  normalized: {
    name: string
    level: '0' | '1' | '5' | '6' | '10'
    chunkKb: number
    devices: string[]
    raidDevices: number
  }
}

export interface CreateMdArrayClusterExecutionResult {
  mode: 'cluster'
  clusterId?: string
  sourceSanId: string
  stopOnFirstFailure: true
  nodeResults: CreateMdArrayNodeResult[]
  failedSanId?: string
  refreshedSanIds?: string[]
}

export interface RaidClusterPreparedMappingHint {
  sourceSanId: string
  clusterId?: string
  createdAt: number
  diskMappings: ClusterDiskMappingInput[]
  partitionMappings: ClusterDiskMappingInput[]
  sourceDisks: string[]
  sourcePartitions: string[]
}

export interface RaidToolDetection {
  available: boolean
  path?: string
  variant?: string
}

export interface RaidToolsDetailed {
  mdadm: RaidToolDetection
  lspci: RaidToolDetection
  lsscsi: RaidToolDetection
  wipefs: RaidToolDetection
  parted: RaidToolDetection
  sfdisk: RaidToolDetection
  fdisk: RaidToolDetection
  partprobe: RaidToolDetection
  udevadm: RaidToolDetection
  storcli: RaidToolDetection
  perccli: RaidToolDetection
  megacli: RaidToolDetection
  arcconf: RaidToolDetection
}

export interface AssembleMdArrayRequest {
  name: string
  uuid?: string
  members?: string[]
  targetName?: string
  confirmation: string
}

export interface AssembleMdArrayResponse {
  stdout: string
  command: string
}

export interface CommandProbeResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
}

export type PartitionMetadataRecommendedAction =
  | 'none'
  | 'advanced_wipe_signatures'
  | 'manual_investigation'

export interface PartitionMetadataDiagnostics {
  partition: string
  zeroSuperblock: CommandProbeResult & { success: boolean }
  mdadmExamine: CommandProbeResult & { detected: boolean }
  wipefsProbe: CommandProbeResult & { signatures: string[] }
  blkidProbe: CommandProbeResult & { types: string[]; available: boolean }
  mdMetadataRemoved: boolean
  verifiedRemoved: boolean
  remainingSignatureTypes: string[]
  remainingRaidSignatureTypes: string[]
  remainingNonMdSignatures: string[]
  nonMdSignaturesDetected: boolean
  detectionSources: { mdadmExamine: boolean; wipefs: boolean; blkid: boolean }
  recommendedAction: PartitionMetadataRecommendedAction
}

export type MdMetadataCleanupMode = 'basic' | 'advanced'

export interface ZeroMdSuperblocksRequest {
  name?: string
  uuid?: string
  members: string[]
  confirmation: string
  mode?: MdMetadataCleanupMode
}

export interface PartitionDetectionSources {
  mdadmExamine: boolean
  wipefs: boolean
  blkid: boolean
}

export interface WipeMdSignaturesRequest {
  members: string[]
  confirmation: string
  mode: MdMetadataCleanupMode
  remainingSignatureTypes?: Record<string, string[]>
  detectionSourcesByMember?: Record<string, PartitionDetectionSources>
}

export interface ZeroMdSuperblockPartitionResult {
  partition: string
  command: string
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
  verifiedRemoved: boolean | null
  mdMetadataRemoved?: boolean
  remainingNonMdSignatures?: string[]
  verificationStdout?: string
  diagnostics?: PartitionMetadataDiagnostics
}

export interface ZeroMdSuperblocksResponse {
  ok: boolean
  results: ZeroMdSuperblockPartitionResult[]
  warnings: string[]
  stdout: string
  commands: string[]
  advancedCleanupAvailable?: boolean
}

export type WipeMdSignaturesResponse = ZeroMdSuperblocksResponse

export interface RaidOverviewResponse {
  scannedAt: number
  tools: {
    mdadm: boolean
    lspci: boolean
    storcli: boolean
    perccli: boolean
    MegaCli64: boolean
    arcconf: boolean
    lsscsi: boolean
    wipefs: boolean
    parted: boolean
    sfdisk: boolean
    fdisk: boolean
    partprobe: boolean
    udevadm: boolean
  }
  hardwareControllers: HardwareRaidController[]
  mdArrays: MdArray[]
  stoppedMdArrays: StoppedMdArray[]
  blockDevices: RaidBlockDevice[]
  alerts: Array<{ severity: 'info' | 'warning' | 'critical'; message: string }>
}

export interface RaidPreflightRequest {
  backend: RaidBackendType
  action:
    | 'create_hw_ld' | 'delete_hw_ld' | 'add_hotspare' | 'remove_hotspare'
    | 'create_md' | 'prepare_md_partitions' | 'stop_md' | 'assemble_md' | 'zero_md_superblocks'
    | 'wipe_md_signatures'
    | 'md_add_device' | 'md_set_faulty' | 'md_remove_device'
  payload: unknown
}

export interface CreateHardwareLogicalDriveRequest {
  controllerId: string
  raidLevel: '0' | '1' | '5' | '6' | '10'
  drives: Array<{ enclosure?: string; slot: string }>
  name?: string
  sizeMode: 'max'
  readPolicy: 'NORA' | 'RA' | 'ADRA'
  writePolicy: 'WT' | 'WB'
  confirmation: string
}

export interface CreateMdArrayRequest {
  name: string
  level: '0' | '1' | '5' | '6' | '10'
  devices: string[]
  chunkKb: number
  assumePartitionsReady?: boolean
  createPartitions?: boolean
  confirmation: string
  clusterExecution?: CreateMdArrayClusterExecutionRequest
}

export interface CreateMdArrayWizardConfirmPayload {
  action: 'view-array' | 'close'
  arrayPath: string
  overviewRefreshed?: boolean
}

export interface CreateMdArrayResponse {
  stdout: string
  command: string
  persisted: boolean
  mode?: 'standalone' | 'cluster'
  refreshed?: boolean
  refreshedSanIds?: string[]
  operationId?: string
  clusterExecution?: CreateMdArrayClusterExecutionResult
}

export interface PrepareMdPartitionsRequest {
  disks: string[]
  partitionTable?: 'auto' | 'gpt' | 'dos'
  allowOverwriteSignatures: boolean
  confirmation: string
  clusterExecution?: PrepareMdPartitionsClusterExecutionRequest
}

export interface PrepareMdPartitionsResponse {
  stdout: string
  commands: string[]
  preparedPartitions: string[]
  mode?: 'standalone' | 'cluster'
  clusterExecution?: PrepareMdPartitionsClusterExecutionResult
  refreshed?: boolean
  refreshedSanIds?: string[]
  operationId?: string
}
