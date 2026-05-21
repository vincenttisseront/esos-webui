/**
 * Shared MD array symmetry checks across cluster nodes.
 * local_symmetric: independent mdadm --create per node (UUIDs may differ).
 * shared_identity: same MD identity on all nodes (UUIDs must match).
 */
import type { ClusterMdUuidConflict } from '~/types/raid'

export type ClusterMdStorageMode = 'local_symmetric' | 'shared_identity'

export const DEFAULT_CLUSTER_MD_STORAGE_MODE: ClusterMdStorageMode = 'local_symmetric'

export function resolveClusterMdStorageMode(explicit?: ClusterMdStorageMode): ClusterMdStorageMode {
  return explicit ?? DEFAULT_CLUSTER_MD_STORAGE_MODE
}

export interface ActiveMdArraySnapshot {
  name: string
  path: string
  uuid?: string
  state: string
  raidLevel?: string
  raidDevices?: number
  activeDevices?: number
  workingDevices?: number
  failedDevices?: number
  sizeBytes?: number
  memberCount?: number
}

export interface ActiveMdNodeReport {
  sanId: string
  label: string
  state: 'active' | 'stopped' | 'missing' | 'other'
  uuid?: string
  arrayPath?: string
}

export type LocalSymmetricIssueKind =
  | 'missing_on_peer'
  | 'raid_level'
  | 'raid_devices'
  | 'active_devices'
  | 'member_count'
  | 'state'
  | 'size'
  | 'failed_devices'

export interface LocalSymmetricStructuralIssue {
  arrayName: string
  kind: LocalSymmetricIssueKind
  severity: 'warning' | 'critical'
  message: string
}

export interface ArraySymmetryResult {
  arrayName: string
  structurallySymmetric: boolean
  structuralIssues: LocalSymmetricStructuralIssue[]
  uuidMismatch?: ClusterUuidMismatch
}

export interface ClusterUuidMismatch {
  arrayName: string
  conflict: ClusterMdUuidConflict
  uniqueUuids: string[]
}

const SIZE_TOLERANCE_RATIO = 0.01
const SIZE_TOLERANCE_MIN_BYTES = 4 * 1024 * 1024

export function mdArrayToActiveSnapshot(arr: {
  name: string
  path: string
  uuid?: string
  state: string
  raidLevel?: string
  raidDevices: number
  activeDevices: number
  workingDevices?: number
  failedDevices: number
  sizeBytes?: number
  members?: unknown[]
}): ActiveMdArraySnapshot {
  return {
    name: arr.name,
    path: arr.path,
    uuid: arr.uuid,
    state: arr.state,
    raidLevel: arr.raidLevel,
    raidDevices: arr.raidDevices,
    activeDevices: arr.activeDevices,
    workingDevices: arr.workingDevices,
    failedDevices: arr.failedDevices,
    sizeBytes: arr.sizeBytes,
    memberCount: arr.members?.length ?? 0,
  }
}

function sizeWithinTolerance(a?: number, b?: number): boolean {
  if (a == null || b == null) return true
  const diff = Math.abs(a - b)
  const max = Math.max(a, b, 1)
  return diff <= Math.max(SIZE_TOLERANCE_MIN_BYTES, max * SIZE_TOLERANCE_RATIO)
}

function healthBucket(state: string): 'healthy' | 'degraded' | 'failed' {
  if (state === 'clean' || state === 'active') return 'healthy'
  if (state === 'degraded' || state === 'recovering' || state === 'resync') return 'degraded'
  if (state === 'failed') return 'failed'
  return 'degraded'
}

function isActiveSnapshot(s: ActiveMdArraySnapshot): boolean {
  return s.state === 'clean' || s.state === 'active' || s.state === 'degraded'
    || s.state === 'recovering' || s.state === 'resync' || s.state === 'failed'
}

export function getActiveUuidConflict(
  nodeReports: ActiveMdNodeReport[],
  arrayName: string,
): {
  conflict: boolean
  nodes: ClusterMdUuidConflict['nodes']
  uniqueUuids: string[]
} {
  const activeWithUuid = nodeReports.filter(r => r.state === 'active' && r.uuid)
  const uniqueUuids = [...new Set(activeWithUuid.map(r => r.uuid!))]
  return {
    conflict: uniqueUuids.length > 1,
    nodes: activeWithUuid.map(r => ({
      sanId: r.sanId,
      label: r.label,
      uuid: r.uuid!,
      arrayPath: r.arrayPath ?? `/dev/${arrayName}`,
    })),
    uniqueUuids,
  }
}

export function buildActiveMdNodeReports(input: {
  arrayName: string
  currentSanId: string
  currentLabel: string
  localArrays: ActiveMdArraySnapshot[]
  peerSnapshots: Array<{
    nodeSanId: string
    nodeLabel: string
    activeMdArrays?: ActiveMdArraySnapshot[]
  }>
}): ActiveMdNodeReport[] {
  const reports: ActiveMdNodeReport[] = []
  const local = input.localArrays.find(a => a.name === input.arrayName)
  if (local) {
    reports.push({
      sanId: input.currentSanId,
      label: input.currentLabel,
      state: local.state === 'clean' || local.state === 'active' ? 'active' : 'other',
      uuid: local.uuid,
      arrayPath: local.path,
    })
  }
  for (const peer of input.peerSnapshots) {
    if (peer.nodeSanId === input.currentSanId) continue
    const arr = peer.activeMdArrays?.find(a => a.name === input.arrayName)
    if (!arr) continue
    reports.push({
      sanId: peer.nodeSanId,
      label: peer.nodeLabel,
      state: arr.state === 'clean' || arr.state === 'active' ? 'active' : 'other',
      uuid: arr.uuid,
      arrayPath: arr.path,
    })
  }
  return reports
}

function compareSnapshotsForArray(
  arrayName: string,
  nodes: Array<{ sanId: string, label: string, snapshot: ActiveMdArraySnapshot }>,
): LocalSymmetricStructuralIssue[] {
  const issues: LocalSymmetricStructuralIssue[] = []
  const activeNodes = nodes.filter(n => isActiveSnapshot(n.snapshot))
  if (activeNodes.length === 0) return issues

  const reference = activeNodes[0]!.snapshot

  for (const node of activeNodes.slice(1)) {
    const s = node.snapshot
    if (reference.raidLevel != null && s.raidLevel != null && reference.raidLevel !== s.raidLevel) {
      issues.push({
        arrayName,
        kind: 'raid_level',
        severity: 'warning',
        message: `${arrayName} : niveau RAID différent (${reference.raidLevel} vs ${s.raidLevel} sur ${node.label})`,
      })
    }
    if (reference.raidDevices != null && s.raidDevices != null && reference.raidDevices !== s.raidDevices) {
      issues.push({
        arrayName,
        kind: 'raid_devices',
        severity: 'warning',
        message: `${arrayName} : nombre de disques RAID différent (${reference.raidDevices} vs ${s.raidDevices} sur ${node.label})`,
      })
    }
    if (reference.activeDevices != null && s.activeDevices != null && reference.activeDevices !== s.activeDevices) {
      issues.push({
        arrayName,
        kind: 'active_devices',
        severity: 'warning',
        message: `${arrayName} : disques actifs différents (${reference.activeDevices}/${reference.raidDevices} vs ${s.activeDevices}/${s.raidDevices} sur ${node.label})`,
      })
    }
    if (reference.memberCount != null && s.memberCount != null && reference.memberCount !== s.memberCount) {
      issues.push({
        arrayName,
        kind: 'member_count',
        severity: 'warning',
        message: `${arrayName} : nombre de membres différent (${reference.memberCount} vs ${s.memberCount} sur ${node.label})`,
      })
    }
    if (healthBucket(reference.state) !== healthBucket(s.state)) {
      issues.push({
        arrayName,
        kind: 'state',
        severity: 'warning',
        message: `${arrayName} : état différent (${reference.state} vs ${s.state} sur ${node.label})`,
      })
    }
    if (!sizeWithinTolerance(reference.sizeBytes, s.sizeBytes)) {
      issues.push({
        arrayName,
        kind: 'size',
        severity: 'warning',
        message: `${arrayName} : taille différente entre nœuds sur ${node.label}`,
      })
    }
    const refFailed = reference.failedDevices ?? 0
    const nodeFailed = s.failedDevices ?? 0
    if (refFailed !== nodeFailed) {
      issues.push({
        arrayName,
        kind: 'failed_devices',
        severity: 'warning',
        message: `${arrayName} : disques en échec différents (${refFailed} vs ${nodeFailed} sur ${node.label})`,
      })
    }
  }

  return issues
}

export function findLocalSymmetricStructuralIssues(input: {
  currentSanId: string
  currentLabel: string
  localArrays: ActiveMdArraySnapshot[]
  peerSnapshots: Array<{
    nodeSanId: string
    nodeLabel: string
    activeMdArrays?: ActiveMdArraySnapshot[]
  }>
}): ArraySymmetryResult[] {
  const arrayNames = new Set<string>()
  for (const a of input.localArrays) if (isActiveSnapshot(a)) arrayNames.add(a.name)
  for (const peer of input.peerSnapshots) {
    for (const a of peer.activeMdArrays ?? []) {
      if (isActiveSnapshot(a)) arrayNames.add(a.name)
    }
  }

  const results: ArraySymmetryResult[] = []

  for (const arrayName of arrayNames) {
    const localArr = input.localArrays.find(a => a.name === arrayName && isActiveSnapshot(a))
    const structuralIssues: LocalSymmetricStructuralIssue[] = []
    const nodeSnapshots: Array<{ sanId: string, label: string, snapshot: ActiveMdArraySnapshot }> = []

    if (localArr) {
      nodeSnapshots.push({
        sanId: input.currentSanId,
        label: input.currentLabel,
        snapshot: localArr,
      })
    }

    for (const peer of input.peerSnapshots) {
      if (peer.nodeSanId === input.currentSanId) continue
      const arr = peer.activeMdArrays?.find(a => a.name === arrayName)
      if (arr && isActiveSnapshot(arr)) {
        nodeSnapshots.push({ sanId: peer.nodeSanId, label: peer.nodeLabel, snapshot: arr })
      } else if (localArr) {
        structuralIssues.push({
          arrayName,
          kind: 'missing_on_peer',
          severity: 'critical',
          message: `${arrayName} : actif sur ce nœud, absent ou inactif sur ${peer.nodeLabel}`,
        })
      }
    }

    if (localArr) {
      for (const peer of input.peerSnapshots) {
        if (peer.nodeSanId === input.currentSanId) continue
        const peerHas = peer.activeMdArrays?.some(a => a.name === arrayName && isActiveSnapshot(a))
        if (!peerHas && !structuralIssues.some(i => i.kind === 'missing_on_peer' && i.message.includes(peer.nodeLabel))) {
          const peerActiveElsewhere = peer.activeMdArrays?.some(a => isActiveSnapshot(a))
          if (!peerActiveElsewhere || !peer.activeMdArrays?.find(a => a.name === arrayName)) {
            structuralIssues.push({
              arrayName,
              kind: 'missing_on_peer',
              severity: 'critical',
              message: `${arrayName} : actif sur ce nœud, absent ou inactif sur ${peer.nodeLabel}`,
            })
          }
        }
      }
    }

    structuralIssues.push(...compareSnapshotsForArray(arrayName, nodeSnapshots))

    const nodeReports = buildActiveMdNodeReports({ ...input, arrayName })
    const uuidInfo = getActiveUuidConflict(nodeReports, arrayName)
    const uuidMismatch = uuidInfo.conflict && uuidInfo.nodes.length >= 2
      ? { arrayName, uniqueUuids: uuidInfo.uniqueUuids, conflict: { arrayName, nodes: uuidInfo.nodes } }
      : undefined

    const deduped = [...new Map(structuralIssues.map(i => [i.message, i])).values()]
    results.push({
      arrayName,
      structurallySymmetric: deduped.length === 0,
      structuralIssues: deduped,
      uuidMismatch,
    })
  }

  return results
}

export function findClusterUuidMismatches(input: {
  currentSanId: string
  currentLabel: string
  localArrays: ActiveMdArraySnapshot[]
  peerSnapshots: Array<{
    nodeSanId: string
    nodeLabel: string
    activeMdArrays?: ActiveMdArraySnapshot[]
  }>
  mode?: ClusterMdStorageMode
}): ClusterUuidMismatch[] {
  const mode = resolveClusterMdStorageMode(input.mode)
  if (mode !== 'shared_identity') return []

  const names = new Set<string>()
  for (const a of input.localArrays) names.add(a.name)
  for (const peer of input.peerSnapshots) {
    for (const a of peer.activeMdArrays ?? []) names.add(a.name)
  }

  const mismatches: ClusterUuidMismatch[] = []
  for (const arrayName of names) {
    const nodeReports = buildActiveMdNodeReports({ ...input, arrayName })
    const uuidInfo = getActiveUuidConflict(nodeReports, arrayName)
    if (!uuidInfo.conflict || uuidInfo.nodes.length < 2) continue
    mismatches.push({
      arrayName,
      uniqueUuids: uuidInfo.uniqueUuids,
      conflict: { arrayName, nodes: uuidInfo.nodes },
    })
  }
  return mismatches
}

/** Assess all arrays for cockpit / server (mode-aware). */
export function assessClusterArraySymmetry(input: {
  currentSanId: string
  currentLabel: string
  localArrays: ActiveMdArraySnapshot[]
  peerSnapshots: Array<{
    nodeSanId: string
    nodeLabel: string
    activeMdArrays?: ActiveMdArraySnapshot[]
  }>
  mode?: ClusterMdStorageMode
}): ArraySymmetryResult[] {
  const mode = resolveClusterMdStorageMode(input.mode)
  if (mode === 'shared_identity') {
    const uuidMismatches = findClusterUuidMismatches({ ...input, mode })
    return uuidMismatches.map(m => ({
      arrayName: m.arrayName,
      structurallySymmetric: false,
      structuralIssues: [{
        arrayName: m.arrayName,
        kind: 'raid_level',
        severity: 'warning',
        message: `UUID MD différents entre nœuds actifs pour ${m.arrayName} : ${m.uniqueUuids.join(', ')} — ce ne sont pas le même tableau`,
      }],
      uuidMismatch: m,
    }))
  }
  return findLocalSymmetricStructuralIssues(input)
}

/** True when message is only a cross-node MD UUID mismatch (not structural). */
export function isMdUuidMismatchMessage(message: string): boolean {
  return message.includes('UUID MD différents')
    || message.toLowerCase().includes('different md uuid')
}

/** Drop UUID-only mismatch messages from cluster health in local_symmetric mode. */
export function filterMdHealthWarnings(
  warnings: string[],
  mode?: ClusterMdStorageMode,
): string[] {
  if (resolveClusterMdStorageMode(mode) !== 'local_symmetric') return warnings
  return warnings.filter(w => !isMdUuidMismatchMessage(w))
}

export function localSymmetricUuidTechnicalLine(
  arrayName: string,
  uniqueUuids: string[],
  t?: (key: string, params?: Record<string, string | number>) => string,
): string {
  const uuids = uniqueUuids.join(', ')
  if (t) return t('raid.cockpit.technical.uuid_local_symmetric', { arrayName, uuids })
  return `UUID différents entre nœuds pour ${arrayName} (attendu pour des tableaux MD locaux symétriques) : ${uuids}`
}
