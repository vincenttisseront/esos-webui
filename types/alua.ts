/** ALUA read-only types (client + server safe). */

export type ALUAState = 'active' | 'nonoptimized' | 'standby' | 'unavailable' | 'unknown'

export type AluaTargetGroupRole = 'local' | 'remote' | 'unknown'

export type AluaClusterHealth =
  | 'ok'
  | 'missing'
  | 'asymmetric'
  | 'invalid_refs'
  | 'unknown'

export type AluaIssueSeverity = 'error' | 'warning' | 'info'

export type AluaIssueCode =
  | 'missing_alua_config'
  | 'asymmetric_device_groups'
  | 'asymmetric_target_groups'
  | 'missing_local_remote_pair'
  | 'group_id_not_reversed'
  | 'target_assignment_mismatch'
  | 'invalid_target_reference'
  | 'state_divergence'
  | 'node_unreachable'
  | 'manual_review'

export interface AluaTargetRef {
  targetName:    string
  relTargetId?:  number
}

export interface AluaTargetGroup {
  name:      string
  groupId:   number | null
  state:     ALUAState
  role:      AluaTargetGroupRole
  targets:   AluaTargetRef[]
}

export interface AluaDeviceGroup {
  name:         string
  devices:      string[]
  targetGroups: AluaTargetGroup[]
}

export interface AluaNodeSnapshot {
  nodeId:       string
  hostname:     string
  host:         string
  sshReady:     boolean
  deviceGroups: AluaDeviceGroup[]
  aluaPresent:  boolean
}

export interface AluaIssue {
  code:         AluaIssueCode
  severity:     AluaIssueSeverity
  messageKey:   string
  messageParams?: Record<string, string | number>
  nodeIds?:     string[]
  deviceGroup?: string
  targetGroup?: string
  targetName?:  string
}

export interface AluaClusterComparison {
  health:       AluaClusterHealth
  summaryKey:   string
  summaryParams?: Record<string, string | number>
  issues:       AluaIssue[]
}

export interface AluaClusterReport {
  clusterId:    string
  clusterName?: string
  scannedAt:    number
  nodes:        AluaNodeSnapshot[]
  comparison:   AluaClusterComparison
}

export type AluaWizardMode = 'create' | 'replace'

export type AluaWizardTargetRole = 'local' | 'remote'

export interface AluaWizardTargetGroupNames {
  local:  string
  remote: string
}

export interface AluaWizardGroupIds {
  local:  number
  remote: number
}

export interface AluaWizardAssignment {
  nodeId:     string
  targetName: string
  role:       AluaWizardTargetRole
}

export interface AluaWizardRequest {
  clusterId:        string
  primaryNodeId?:   string
  deviceGroupName:  string
  deviceNames:      string[]
  targetGroupNames: AluaWizardTargetGroupNames
  groupIdsOnPrimary: AluaWizardGroupIds
  assignments:      AluaWizardAssignment[]
  mode:             AluaWizardMode
}

export interface AluaWizardBlocker {
  code:       string
  messageKey: string
  messageParams?: Record<string, string | number>
}

export interface AluaWizardPreflightResult {
  ok:        boolean
  blockers:  AluaWizardBlocker[]
  warnings:  AluaWizardBlocker[]
  nodeCount: number
  canExecute: boolean
}

export interface AluaNodePlan {
  nodeId:             string
  hostname:           string
  deviceGroup:        import('./esos').AluaDeviceGroupConfig
  scstConfBefore:     string
  scstConfAfter:      string
  configPatchSummary: string[]
  warnings:           string[]
}

export interface AluaClusterPlan {
  clusterId:          string
  primaryNodeId:      string
  peerNodeId:         string
  nodes:              AluaNodePlan[]
  comparisonPreview:  AluaClusterComparison
  planToken:          string
}

export interface AluaWizardInventoryNode {
  nodeId:           string
  hostname:         string
  host:             string
  sshReady:         boolean
  readOnly:         boolean
  devices:          string[]
  targets:          string[]
  existingDeviceGroups: AluaDeviceGroup[]
  suggestedAssignments: AluaWizardAssignment[]
}

export interface AluaWizardInventory {
  clusterId:   string
  clusterName?: string
  nodeCount:   number
  canExecute:  boolean
  nodes:       AluaWizardInventoryNode[]
}

export interface AluaClusterApplyNodeResult {
  nodeId:    string
  hostname:  string
  ok:        boolean
  error?:    string
}

export interface AluaClusterApplyResult {
  ok:           boolean
  nodeResults:  AluaClusterApplyNodeResult[]
  errors:       string[]
}

/** Legacy flat row (cluster status fingerprint). */
export interface ALUAGroupFlat {
  deviceGroup: string
  targetGroup: string
  groupId:     number
  state:       ALUAState
  targets:     string[]
}
