import type { InstalledESOSVersion } from '~/server/utils/types'

export type UpgradeReadinessLevel = 'ready' | 'warning' | 'blocked'

export interface UpgradeCheck {
  id: string
  level: UpgradeReadinessLevel
  ok: boolean
  detail: string
  meta?: Record<string, unknown>
}

export interface UpgradeNodeClusterInfo {
  role: string | null
  peerSanId: string | null
  peerLabel: string | null
  peerReachable: boolean
  clusterHealthy: boolean
}

export interface UpgradeNodeReadiness {
  sanId: string
  label: string
  level: UpgradeReadinessLevel
  checks: UpgradeCheck[]
  installed: InstalledESOSVersion
  cluster?: UpgradeNodeClusterInfo
}

export interface UpgradeReadinessReport {
  scannedAt: number
  scope: { type: 'san' | 'cluster'; id: string; label: string }
  overall: UpgradeReadinessLevel
  summary: string[]
  nodes: UpgradeNodeReadiness[]
}

export type UpgradePlanStepKind =
  | 'precheck'
  | 'conf_sync'
  | 'stage_package'
  | 'install'
  | 'verify_config'
  | 'reboot'
  | 'post_reboot'

export interface UpgradePlanStep {
  id: string
  kind: UpgradePlanStepKind
  manual: boolean
  commands: string[]
  notes?: string[]
}

export interface UpgradePlanNode {
  sanId: string
  label: string
  order: number
  steps: UpgradePlanStep[]
}

export interface UpgradePlan {
  id: string
  createdAt: number
  mode: 'standalone' | 'cluster_rolling'
  targetVersion?: string
  packageStagingId?: string
  globalWarnings: string[]
  nodes: UpgradePlanNode[]
}

export type UpgradePackagePhase =
  | 'idle'
  | 'uploading'
  | 'transferring'
  | 'extracting'
  | 'ready'
  | 'error'

export interface UpgradePackageStatus {
  stagingId: string
  sanId: string
  phase: UpgradePackagePhase
  filename?: string
  remoteArchivePath?: string
  stagingDir?: string
  installShPath?: string
  bytesTotal?: number
  bytesTransferred?: number
  error?: string
  updatedAt: number
}
