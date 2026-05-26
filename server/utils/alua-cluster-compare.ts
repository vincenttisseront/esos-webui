import type {
  AluaClusterComparison,
  AluaClusterHealth,
  AluaDeviceGroup,
  AluaIssue,
  AluaNodeSnapshot,
  AluaTargetGroupRole,
} from '../../types/alua'
import { aluaFingerprintFromDeviceGroups } from './alua-model'

export interface AluaCompareOptions {
  /** Target names from scst.conf per node (for invalid_target_reference). */
  scstTargetsByNode?: Map<string, Set<string>>
  /** Require local+remote pair and reversed group IDs (two-node ESOS pattern). */
  expectLocalRemotePair?: boolean
}

export function buildAluaNodeSnapshot(
  nodeId: string,
  hostname: string,
  host: string,
  sshReady: boolean,
  deviceGroups: AluaDeviceGroup[],
): AluaNodeSnapshot {
  return {
    nodeId,
    hostname,
    host,
    sshReady,
    deviceGroups,
    aluaPresent: sshReady && deviceGroups.length > 0,
  }
}

export function compareAluaCluster(
  nodes: AluaNodeSnapshot[],
  options: AluaCompareOptions = {},
): AluaClusterComparison {
  const issues: AluaIssue[] = []
  const ready = nodes.filter(n => n.sshReady)

  for (const node of ready) {
    if (node.deviceGroups.length === 0) {
      issues.push({
        code:       'missing_alua_config',
        severity:   'error',
        messageKey: 'cluster.alua.issues.missing_alua_config',
        nodeIds:    [node.nodeId],
      })
    }
  }

  const unreachable = nodes.filter(n => !n.sshReady)
  for (const node of unreachable) {
    issues.push({
      code:       'node_unreachable',
      severity:   'warning',
      messageKey: 'cluster.alua.issues.node_unreachable',
      nodeIds:    [node.nodeId],
      messageParams: { hostname: node.hostname },
    })
  }

  if (ready.length < 2) {
    return finalizeComparison(issues, 'unknown', 'cluster.alua.summary.single_node', {})
  }

  const dgNames = unionDeviceGroupNames(ready)
  if (!deviceGroupSetsMatch(ready, dgNames)) {
    issues.push({
      code:       'asymmetric_device_groups',
      severity:   'error',
      messageKey: 'cluster.alua.issues.asymmetric_device_groups',
      nodeIds:    ready.map(n => n.nodeId),
    })
  }

  for (const dgName of dgNames) {
    const tgNames = unionTargetGroupNames(ready, dgName)
    if (!targetGroupSetsMatch(ready, dgName, tgNames)) {
      issues.push({
        code:       'asymmetric_target_groups',
        severity:   'error',
        messageKey: 'cluster.alua.issues.asymmetric_target_groups',
        nodeIds:    ready.map(n => n.nodeId),
        deviceGroup: dgName,
      })
    }

    checkStateDivergence(issues, ready, dgName, tgNames)
    checkLocalRemotePair(issues, ready, dgName, options.expectLocalRemotePair !== false)
    checkReversedGroupIds(issues, ready, dgName, options.expectLocalRemotePair !== false)
    checkTargetAssignment(issues, ready, dgName)
    checkInvalidTargetRefs(issues, ready, dgName, options.scstTargetsByNode)
  }

  const fingerprints = ready.map(n => aluaFingerprintFromDeviceGroups(n.deviceGroups))
  const nonEmpty     = fingerprints.filter(f => f.length > 0)
  if (nonEmpty.length >= 2 && new Set(nonEmpty).size > 1) {
    const hasStructural = issues.some(i =>
      ['asymmetric_device_groups', 'asymmetric_target_groups', 'group_id_not_reversed', 'target_assignment_mismatch'].includes(i.code),
    )
    if (!hasStructural) {
      issues.push({
        code:       'state_divergence',
        severity:   'warning',
        messageKey: 'cluster.alua.issues.state_divergence',
        nodeIds:    ready.map(n => n.nodeId),
      })
    }
  }

  const hasError = issues.some(i => i.severity === 'error')
  const hasInvalid = issues.some(i => i.code === 'invalid_target_reference')
  const hasAsymmetric = issues.some(i =>
    ['asymmetric_device_groups', 'asymmetric_target_groups', 'group_id_not_reversed', 'target_assignment_mismatch', 'missing_local_remote_pair'].includes(i.code),
  )
  const hasMissing = issues.some(i => i.code === 'missing_alua_config')

  let health: AluaClusterHealth = 'ok'
  if (hasInvalid) health = 'invalid_refs'
  else if (hasAsymmetric) health = 'asymmetric'
  else if (hasMissing) health = 'missing'
  else if (hasError) health = 'asymmetric'
  else if (issues.some(i => i.severity === 'warning' && i.code !== 'node_unreachable')) health = 'asymmetric'

  if (health === 'ok') {
    return finalizeComparison(issues, 'ok', 'cluster.alua.summary.ok', {})
  }
  if (health === 'missing') {
    return finalizeComparison(issues, health, 'cluster.alua.summary.missing', { count: issues.filter(i => i.code === 'missing_alua_config').length })
  }
  if (health === 'invalid_refs') {
    return finalizeComparison(issues, health, 'cluster.alua.summary.invalid_refs', {})
  }
  return finalizeComparison(issues, 'asymmetric', 'cluster.alua.summary.asymmetric', { issueCount: issues.filter(i => i.severity === 'error').length })
}

function finalizeComparison(
  issues: AluaIssue[],
  health: AluaClusterHealth,
  summaryKey: string,
  summaryParams: Record<string, string | number>,
): AluaClusterComparison {
  return { health, summaryKey, summaryParams, issues }
}

function unionDeviceGroupNames(nodes: AluaNodeSnapshot[]): string[] {
  const names = new Set<string>()
  for (const n of nodes) {
    for (const dg of n.deviceGroups) names.add(dg.name)
  }
  return [...names].sort()
}

function deviceGroupSetsMatch(nodes: AluaNodeSnapshot[], expected: string[]): boolean {
  for (const n of nodes) {
    const names = n.deviceGroups.map(d => d.name).sort()
    if (names.join('|') !== expected.join('|')) return false
  }
  return true
}

function unionTargetGroupNames(nodes: AluaNodeSnapshot[], dgName: string): string[] {
  const names = new Set<string>()
  for (const n of nodes) {
    const dg = n.deviceGroups.find(d => d.name === dgName)
    for (const tg of dg?.targetGroups ?? []) names.add(tg.name)
  }
  return [...names].sort()
}

function targetGroupSetsMatch(nodes: AluaNodeSnapshot[], dgName: string, expected: string[]): boolean {
  for (const n of nodes) {
    const dg = n.deviceGroups.find(d => d.name === dgName)
    const names = (dg?.targetGroups ?? []).map(t => t.name).sort()
    if (names.join('|') !== expected.join('|')) return false
  }
  return true
}

function findTg(node: AluaNodeSnapshot, dgName: string, tgName: string) {
  return node.deviceGroups.find(d => d.name === dgName)?.targetGroups.find(t => t.name === tgName)
}

function checkStateDivergence(
  issues: AluaIssue[],
  nodes: AluaNodeSnapshot[],
  dgName: string,
  tgNames: string[],
): void {
  for (const tgName of tgNames) {
    const states = new Set<string>()
    for (const n of nodes) {
      const tg = findTg(n, dgName, tgName)
      if (tg) states.add(tg.state)
    }
    if (states.size > 1) {
      issues.push({
        code:       'state_divergence',
        severity:   'warning',
        messageKey: 'cluster.alua.issues.state_divergence_detail',
        nodeIds:    nodes.map(n => n.nodeId),
        deviceGroup: dgName,
        targetGroup: tgName,
      })
    }
  }
}

function checkLocalRemotePair(
  issues: AluaIssue[],
  nodes: AluaNodeSnapshot[],
  dgName: string,
  enabled: boolean,
): void {
  if (!enabled) return
  for (const n of nodes) {
    const dg = n.deviceGroups.find(d => d.name === dgName)
    if (!dg) continue
    const roles = new Set(dg.targetGroups.map(t => t.role))
    if (!roles.has('local') || !roles.has('remote')) {
      const unknownOnly = dg.targetGroups.every(t => t.role === 'unknown')
      issues.push({
        code:       unknownOnly ? 'manual_review' : 'missing_local_remote_pair',
        severity:   unknownOnly ? 'info' : 'error',
        messageKey: unknownOnly
          ? 'cluster.alua.issues.manual_review'
          : 'cluster.alua.issues.missing_local_remote_pair',
        nodeIds:    [n.nodeId],
        deviceGroup: dgName,
      })
    }
  }
}

function checkReversedGroupIds(
  issues: AluaIssue[],
  nodes: AluaNodeSnapshot[],
  dgName: string,
  enabled: boolean,
): void {
  if (!enabled || nodes.length !== 2) return

  const [a, b] = nodes
  const localA = findTg(a!, dgName, 'local')
  const remoteA = findTg(a!, dgName, 'remote')
  const localB = findTg(b!, dgName, 'local')
  const remoteB = findTg(b!, dgName, 'remote')

  if (!localA || !remoteA || !localB || !remoteB) return
  if ([localA, remoteA, localB, remoteB].some(t => t.groupId == null)) return

  const reversed =
    localA.groupId === remoteB.groupId
    && remoteA.groupId === localB.groupId

  if (!reversed) {
    issues.push({
      code:       'group_id_not_reversed',
      severity:   'error',
      messageKey: 'cluster.alua.issues.group_id_not_reversed',
      nodeIds:    [a!.nodeId, b!.nodeId],
      deviceGroup: dgName,
    })
  }
}

function targetNamesForRole(tgRole: AluaTargetGroupRole, targets: { targetName: string }[]): string[] {
  return targets.map(t => t.targetName).sort()
}

function checkTargetAssignment(
  issues: AluaIssue[],
  nodes: AluaNodeSnapshot[],
  dgName: string,
): void {
  if (nodes.length !== 2) return
  const [a, b] = nodes

  const localA = findTg(a!, dgName, 'local')
  const remoteB = findTg(b!, dgName, 'remote')
  const localB = findTg(b!, dgName, 'local')
  const remoteA = findTg(a!, dgName, 'remote')

  if (localA && remoteB) {
    const localNames = targetNamesForRole('local', localA.targets)
    const remoteNames = targetNamesForRole('remote', remoteB.targets)
    if (localNames.length && remoteNames.length && !setsEqual(localNames, remoteNames)) {
      issues.push({
        code:       'target_assignment_mismatch',
        severity:   'error',
        messageKey: 'cluster.alua.issues.target_assignment_mismatch',
        nodeIds:    [a!.nodeId, b!.nodeId],
        deviceGroup: dgName,
      })
      return
    }
  }
  if (localB && remoteA) {
    const localNames = targetNamesForRole('local', localB.targets)
    const remoteNames = targetNamesForRole('remote', remoteA.targets)
    if (localNames.length && remoteNames.length && !setsEqual(localNames, remoteNames)) {
      issues.push({
        code:       'target_assignment_mismatch',
        severity:   'error',
        messageKey: 'cluster.alua.issues.target_assignment_mismatch',
        nodeIds:    [a!.nodeId, b!.nodeId],
        deviceGroup: dgName,
      })
    }
  }
}

function checkInvalidTargetRefs(
  issues: AluaIssue[],
  nodes: AluaNodeSnapshot[],
  dgName: string,
  scstTargetsByNode?: Map<string, Set<string>>,
): void {
  if (!scstTargetsByNode) return

  for (const n of nodes) {
    const confTargets = scstTargetsByNode.get(n.nodeId)
    if (!confTargets) continue
    const dg = n.deviceGroups.find(d => d.name === dgName)
    for (const tg of dg?.targetGroups ?? []) {
      for (const t of tg.targets) {
        if (!confTargets.has(t.targetName)) {
          issues.push({
            code:       'invalid_target_reference',
            severity:   'error',
            messageKey: 'cluster.alua.issues.invalid_target_reference',
            nodeIds:    [n.nodeId],
            deviceGroup: dgName,
            targetGroup: tg.name,
            targetName:  t.targetName,
          })
        }
      }
    }
  }
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

/** Legacy fingerprint symmetry for storage-consistency panel. */
export function compareScstAluaFingerprintSymmetry(
  nodes: Array<{ sshReady: boolean; deviceGroups: AluaDeviceGroup[] }>,
): { checked: boolean; symmetric: boolean | null; summaryKey: string; summaryParams?: Record<string, string | number> } {
  const ready = nodes.filter(n => n.sshReady)
  if (ready.length < 2) {
    return {
      checked:    ready.length >= 2,
      symmetric:  null,
      summaryKey: 'cluster.alua.scst.single_node',
    }
  }

  const fingerprints = ready.map(n => aluaFingerprintFromDeviceGroups(n.deviceGroups))
  const nonEmpty = fingerprints.filter(f => f.length > 0)
  if (nonEmpty.length < 2) {
    return {
      checked:    true,
      symmetric:  null,
      summaryKey: 'cluster.alua.scst.partial_exposure',
    }
  }

  const unique = new Set(nonEmpty)
  const symmetric = unique.size === 1
  return {
    checked:   true,
    symmetric,
    summaryKey: symmetric ? 'cluster.alua.scst.symmetric' : 'cluster.alua.scst.asymmetric',
    summaryParams: symmetric ? undefined : { profiles: unique.size },
  }
}
