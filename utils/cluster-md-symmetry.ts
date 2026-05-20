/**
 * Shared MD array symmetry checks (UUID conflict across cluster nodes).
 * Used by server cluster recovery assessment and RAID cockpit view model.
 */
import type { ClusterMdUuidConflict } from '~/types/raid'

export interface ActiveMdArraySnapshot {
  name: string
  path: string
  uuid?: string
  state: string
}

export interface ActiveMdNodeReport {
  sanId: string
  label: string
  state: 'active' | 'stopped' | 'missing' | 'other'
  uuid?: string
  arrayPath?: string
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

export interface ClusterUuidMismatch {
  arrayName: string
  conflict: ClusterMdUuidConflict
  uniqueUuids: string[]
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
}): ClusterUuidMismatch[] {
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
