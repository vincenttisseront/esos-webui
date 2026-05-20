/**
 * Per-node MD array state classification and cluster recovery assessment
 * for degraded HA clusters (asymmetric active/stopped/missing across nodes).
 */
import { createHash } from 'node:crypto'
import { createError } from 'h3'
const MD_ARRAY_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/
import { runNodePreflight } from './raid-cluster-storage-preflight'
import {
  assessClusterArraySymmetry,
  getActiveUuidConflict as getActiveUuidConflictShared,
  mdArrayToActiveSnapshot,
  resolveClusterMdStorageMode,
  type ClusterMdStorageMode,
} from '../../utils/cluster-md-symmetry'
import type {
  ClusterMdPreflightAction,
  ClusterMdRecoveryMode,
  ClusterMdUuidConflict,
  ClusterStorageNodeInventory,
  MdArray,
  RaidPreflightResult,
  StoppedMdArray,
} from './raid-types'

export type MdArrayNodeState =
  | 'unreachable'
  | 'error'
  | 'active'
  | 'stopped'
  | 'metadata_only'
  | 'inactive_device'
  | 'missing'

export interface MdArrayNodeStateReport {
  sanId: string
  label: string
  role: string | null
  sshReady: boolean
  state: MdArrayNodeState
  arrayPath?: string
  members: string[]
  uuid?: string
  reasons: string[]
  nodeBlockers: string[]
  nodeWarnings: string[]
}

export interface ClusterMdRecoveryAssessment {
  action: ClusterMdPreflightAction
  arrayName: string
  uuid?: string
  nodeReports: MdArrayNodeStateReport[]
  hardBlockers: string[]
  warnings: string[]
  allowedRecoveryModes: ClusterMdRecoveryMode[]
  recommendedRecoveryMode: ClusterMdRecoveryMode | null
  okSymmetric: boolean
  okDegraded: boolean
  uuidConflict?: ClusterMdUuidConflict
}

function normalizeArrayName(name: string): string {
  return name.trim()
}

function findStoppedMdArray(
  stoppedMdArrays: StoppedMdArray[],
  name: string,
  uuid?: string,
): StoppedMdArray | undefined {
  return stoppedMdArrays.find(arr =>
    arr.name === name
    || arr.path === `/dev/${name}`
    || (uuid && arr.uuid === uuid),
  )
}

function findActiveArray(
  mdArrays: MdArray[],
  name: string,
  uuid?: string,
): MdArray | undefined {
  return mdArrays.find(arr =>
    arr.name === name
    || arr.path === `/dev/${name}`
    || (uuid && arr.uuid === uuid),
  )
}

function hasMetadataOnlySignal(
  node: ClusterStorageNodeInventory,
  name: string,
  uuid?: string,
): { members: string[]; reasons: string[] } | null {
  const stopped = findStoppedMdArray(node.stoppedMdArrays ?? [], name, uuid)
  if (stopped) {
    const members = stopped.members.filter(m => m.present && m.path && m.path !== '—').map(m => m.path)
    if (members.length > 0) {
      return { members, reasons: ['Métadonnées MD sur partitions membres (tableau arrêté)'] }
    }
  }
  const targetPath = `/dev/${name}`
  for (const dev of node.blockDevices) {
    if (dev.type !== 'part') continue
    if (!dev.hasMdSuperblock && !dev.usedBy.includes('md')) continue
    const members = [dev.path]
    return { members, reasons: ['Superblock ou signal MD sur partition'] }
  }
  const inactive = node.blockDevices.find(
    d => d.type === 'raid' && MD_ARRAY_PATH_RE.test(d.path) && d.path !== targetPath,
  )
  if (inactive) {
    return { members: [], reasons: [`Périphérique ${inactive.path} sans tableau actif correspondant`] }
  }
  return null
}

function findInactiveDevice(
  node: ClusterStorageNodeInventory,
  name: string,
): string | undefined {
  const targetPath = `/dev/${name}`
  const dev = node.blockDevices.find(
    d => d.type === 'raid' && d.path === targetPath && !node.mdArrays.some(a => a.path === targetPath),
  )
  return dev?.path
}

export function classifyMdArrayNodeState(
  node: ClusterStorageNodeInventory,
  arrayName: string,
  uuid?: string,
): MdArrayNodeStateReport {
  const name = normalizeArrayName(arrayName)
  const base = {
    sanId: node.sanId,
    label: node.label,
    role: node.role,
    sshReady: node.sshReady,
    members: [] as string[],
    reasons: [] as string[],
    nodeBlockers: [] as string[],
    nodeWarnings: [] as string[],
  }

  if (!node.sshReady) {
    return {
      ...base,
      state: 'unreachable',
      reasons: [node.error ? `SSH : ${node.error}` : 'SSH non connecté'],
    }
  }

  if (!node.tools) {
    return {
      ...base,
      state: 'error',
      reasons: [node.error ?? 'Inventaire RAID ou outils indisponibles'],
    }
  }

  const active = findActiveArray(node.mdArrays, name, uuid)
  if (active) {
    const members = active.members.map(m => m.path)
    const blockers: string[] = []
    if (active.usedBy.includes('mounted')) blockers.push(`${active.path} est monté`)
    if (active.usedBy.includes('lvm')) blockers.push(`${active.path} est utilisé par LVM`)
    if (active.usedBy.includes('scst')) blockers.push(`${active.path} est utilisé par SCST`)
    if (active.state === 'recovering' || active.state === 'resync') {
      base.nodeWarnings.push('Rebuild/resync en cours')
    }
    return {
      ...base,
      state: 'active',
      arrayPath: active.path ?? `/dev/${name}`,
      members,
      uuid: active.uuid,
      reasons: ['Tableau actif dans mdstat'],
      nodeBlockers: blockers,
    }
  }

  const stopped = findStoppedMdArray(node.stoppedMdArrays ?? [], name, uuid)
  if (stopped) {
    const members = stopped.members.filter(m => m.present && m.path && m.path !== '—').map(m => m.path)
    const blockers: string[] = []
    if (stopped.stoppedState === 'ambiguous') {
      blockers.push('État du tableau ambigu — vérifiez les métadonnées')
    }
    return {
      ...base,
      state: 'stopped',
      arrayPath: stopped.path ?? `/dev/${name}`,
      members,
      uuid: stopped.uuid,
      reasons: [`Tableau arrêté (${stopped.stoppedState ?? 'unknown'})`],
      nodeBlockers: blockers,
    }
  }

  const inactivePath = findInactiveDevice(node, name)
  if (inactivePath) {
    return {
      ...base,
      state: 'inactive_device',
      arrayPath: inactivePath,
      reasons: ['Périphérique /dev/md* présent sans entrée mdstat active'],
    }
  }

  const metadata = hasMetadataOnlySignal(node, name, uuid)
  if (metadata) {
    return {
      ...base,
      state: 'metadata_only',
      members: metadata.members,
      reasons: metadata.reasons,
    }
  }

  return {
    ...base,
    state: 'missing',
    reasons: [`Aucun signal pour le tableau ${name} sur ce nœud`],
  }
}

export function classifyClusterMdNodeStates(
  nodes: ClusterStorageNodeInventory[],
  arrayName: string,
  uuid?: string,
): MdArrayNodeStateReport[] {
  return nodes.map(node => classifyMdArrayNodeState(node, arrayName, uuid))
}

export function getActiveUuidConflict(
  nodeReports: MdArrayNodeStateReport[],
  arrayName: string,
): {
  conflict: boolean
  nodes: ClusterMdUuidConflict['nodes']
  uniqueUuids: string[]
} {
  return getActiveUuidConflictShared(
    nodeReports.map(r => ({
      sanId: r.sanId,
      label: r.label,
      state: r.state === 'active' ? 'active' as const : 'other' as const,
      uuid: r.uuid,
      arrayPath: r.arrayPath,
    })),
    arrayName,
  )
}

type StopRecoveryAssessmentResult = Pick<
  ClusterMdRecoveryAssessment,
  'hardBlockers' | 'warnings' | 'allowedRecoveryModes' | 'recommendedRecoveryMode' | 'okSymmetric' | 'okDegraded' | 'uuidConflict'
>

export function buildStopRecoveryAssessment(
  nodeReports: MdArrayNodeStateReport[],
  arrayName: string,
  nodes?: ClusterStorageNodeInventory[],
  mode?: ClusterMdStorageMode,
): StopRecoveryAssessmentResult {
  const storageMode = resolveClusterMdStorageMode(mode)
  const hardBlockers: string[] = []
  const warnings: string[] = []
  const activeReports = nodeReports.filter(r => r.state === 'active')
  const activeClean = activeReports.filter(r => r.nodeBlockers.length === 0)
  const uuidInfo = getActiveUuidConflict(nodeReports, arrayName)

  let structurallySymmetric = true
  if (nodes?.length) {
    const anchor = nodes.find(n => n.mdArrays.some(a => a.name === arrayName)) ?? nodes[0]!
    const symmetry = assessClusterArraySymmetry({
      currentSanId: anchor.sanId,
      currentLabel: anchor.label,
      localArrays: anchor.mdArrays
        .filter(a => a.name === arrayName)
        .map(mdArrayToActiveSnapshot),
      peerSnapshots: nodes
        .filter(n => n.sanId !== anchor.sanId)
        .map(n => ({
          nodeSanId: n.sanId,
          nodeLabel: n.label,
          activeMdArrays: n.mdArrays
            .filter(a => a.name === arrayName)
            .map(mdArrayToActiveSnapshot),
        })),
      mode: storageMode,
    })
    const forArray = symmetry.find(s => s.arrayName === arrayName)
    if (forArray) {
      structurallySymmetric = forArray.structurallySymmetric
      for (const issue of forArray.structuralIssues) warnings.push(issue.message)
    }
  }

  if (storageMode === 'shared_identity' && uuidInfo.conflict) {
    warnings.push(
      `UUID MD différents entre nœuds actifs pour ${arrayName} : ${uuidInfo.uniqueUuids.join(', ')} — ce ne sont pas le même tableau`,
    )
  }

  for (const report of activeReports) {
    for (const b of report.nodeBlockers) {
      hardBlockers.push(`${report.label} : ${b}`)
    }
  }

  const unreachable = nodeReports.filter(r => r.state === 'unreachable')
  if (unreachable.length > 0) {
    warnings.push(`${unreachable.length} nœud(s) inaccessible(s) — seront ignorés en mode dégradé`)
  }

  const allowedRecoveryModes: ClusterMdRecoveryMode[] = []
  const allNodesActive = nodeReports.length > 0 && nodeReports.every(r => r.state === 'active')

  const uuidBlocksSymmetric = storageMode === 'shared_identity' && uuidInfo.conflict

  if (uuidBlocksSymmetric && activeReports.length >= 2) {
    allowedRecoveryModes.push('stop_inconsistent_active')
  } else if (!uuidBlocksSymmetric && structurallySymmetric && activeClean.length === nodeReports.length && allNodesActive) {
    allowedRecoveryModes.push('stop_all_active')
  } else if (!structurallySymmetric && activeReports.length >= 2) {
    allowedRecoveryModes.push('stop_inconsistent_active')
  }

  if (!uuidBlocksSymmetric && activeClean.length >= 1 && activeClean.length < nodeReports.length) {
    allowedRecoveryModes.push('stop_active_only')
  } else if (!uuidBlocksSymmetric && activeClean.length >= 1 && nodeReports.some(r => r.state !== 'active')) {
    allowedRecoveryModes.push('stop_active_only')
  }

  if (activeClean.length === 0) {
    const hasStoppedOrMeta = nodeReports.some(r =>
      r.state === 'stopped' || r.state === 'metadata_only' || r.state === 'inactive_device',
    )
    if (!hasStoppedOrMeta && nodeReports.every(r => r.state === 'missing' || r.state === 'unreachable')) {
      hardBlockers.push(`Aucun tableau ${arrayName} actif sur le cluster — rien à arrêter`)
    } else if (activeReports.length === 0) {
      hardBlockers.push(`Aucun tableau ${arrayName} actif — utilisez Assemble ou inspectez les métadonnées`)
    }
  }

  const okSymmetric = allowedRecoveryModes.includes('stop_all_active')
  const okDegraded = allowedRecoveryModes.length > 0 && hardBlockers.length === 0

  let recommendedRecoveryMode: ClusterMdRecoveryMode | null = null
  if (okDegraded) {
    if (allowedRecoveryModes.includes('stop_inconsistent_active')) {
      recommendedRecoveryMode = 'stop_inconsistent_active'
    } else if (allowedRecoveryModes.includes('stop_all_active')) {
      recommendedRecoveryMode = 'stop_all_active'
    } else {
      recommendedRecoveryMode = 'stop_active_only'
    }
  }

  return {
    hardBlockers: [...new Set(hardBlockers)],
    warnings,
    allowedRecoveryModes,
    recommendedRecoveryMode,
    okSymmetric,
    okDegraded,
    uuidConflict: storageMode === 'shared_identity' && uuidInfo.conflict
      ? { arrayName, nodes: uuidInfo.nodes }
      : undefined,
  }
}

export function buildAssembleRecoveryAssessment(
  nodeReports: MdArrayNodeStateReport[],
  arrayName: string,
): Pick<ClusterMdRecoveryAssessment, 'hardBlockers' | 'warnings' | 'allowedRecoveryModes' | 'recommendedRecoveryMode' | 'okSymmetric' | 'okDegraded'> {
  const hardBlockers: string[] = []
  const warnings: string[] = []
  const activeReports = nodeReports.filter(r => r.state === 'active')
  const assemblable = nodeReports.filter(r =>
    (r.state === 'stopped' || r.state === 'metadata_only') && r.nodeBlockers.length === 0,
  )

  if (activeReports.length === nodeReports.length && nodeReports.length > 0) {
    hardBlockers.push(`Le tableau ${arrayName} est déjà actif sur tous les nœuds`)
  }

  for (const report of nodeReports) {
    for (const b of report.nodeBlockers) {
      if (report.state === 'stopped' || report.state === 'metadata_only') {
        hardBlockers.push(`${report.label} : ${b}`)
      }
    }
  }

  const unreachable = nodeReports.filter(r => r.state === 'unreachable')
  if (unreachable.length > 0) {
    warnings.push(`${unreachable.length} nœud(s) inaccessible(s) — seront ignorés`)
  }

  if (activeReports.length > 0 && assemblable.length > 0) {
    warnings.push('Cluster asymétrique : certains nœuds ont le tableau actif, d\'autres des métadonnées arrêtées')
  }

  const allowedRecoveryModes: ClusterMdRecoveryMode[] = []

  if (assemblable.length === nodeReports.length && nodeReports.length > 0) {
    allowedRecoveryModes.push('assemble_stopped_nodes')
  }

  if (assemblable.length >= 1 && (activeReports.length > 0 || nodeReports.some(r => r.state === 'missing'))) {
    allowedRecoveryModes.push('assemble_missing_only')
  } else if (assemblable.length >= 1) {
    allowedRecoveryModes.push('assemble_missing_only', 'assemble_stopped_nodes')
  }

  if (assemblable.length === 0 && activeReports.length === 0) {
    hardBlockers.push(`Aucune métadonnée MD arrêtée pour ${arrayName} — réparation manuelle ou rescan requis`)
  }

  const okSymmetric = allowedRecoveryModes.includes('assemble_stopped_nodes')
    && assemblable.length === nodeReports.length
  const okDegraded = allowedRecoveryModes.length > 0 && hardBlockers.length === 0

  let recommendedRecoveryMode: ClusterMdRecoveryMode | null = null
  if (okDegraded) {
    recommendedRecoveryMode = okSymmetric ? 'assemble_stopped_nodes' : 'assemble_missing_only'
  }

  return {
    hardBlockers: [...new Set(hardBlockers)],
    warnings,
    allowedRecoveryModes: [...new Set(allowedRecoveryModes)],
    recommendedRecoveryMode,
    okSymmetric,
    okDegraded,
  }
}

export function buildClusterMdRecoveryAssessment(input: {
  action: ClusterMdPreflightAction
  arrayName: string
  uuid?: string
  nodes: ClusterStorageNodeInventory[]
}): ClusterMdRecoveryAssessment {
  const nodeReports = classifyClusterMdNodeStates(input.nodes, input.arrayName, input.uuid)
  const stopOrAssemble = input.action === 'stop_md' || input.action === 'assemble_md'
  const partial = input.action === 'stop_md'
    ? buildStopRecoveryAssessment(nodeReports, input.arrayName, input.nodes)
    : input.action === 'assemble_md'
      ? buildAssembleRecoveryAssessment(nodeReports, input.arrayName)
      : {
          hardBlockers: [] as string[],
          warnings: [] as string[],
          allowedRecoveryModes: [] as ClusterMdRecoveryMode[],
          recommendedRecoveryMode: null as ClusterMdRecoveryMode | null,
          okSymmetric: false,
          okDegraded: false,
        }

  return {
    action: input.action,
    arrayName: input.arrayName,
    uuid: input.uuid,
    nodeReports,
    ...partial,
    ...(stopOrAssemble ? {} : { okSymmetric: false, okDegraded: false }),
  }
}

export function expectedClusterStopConfirmation(
  arrayName: string,
  recoveryMode: ClusterMdRecoveryMode,
): string {
  const name = normalizeArrayName(arrayName)
  if (recoveryMode === 'stop_inconsistent_active') {
    return `STOP INCONSISTENT ${name}`
  }
  if (recoveryMode === 'stop_active_only') {
    return `STOP ${name} ON ACTIVE CLUSTER NODES`
  }
  return `STOP ${name}`
}

export function expectedClusterAssembleConfirmation(
  arrayName: string,
  recoveryMode: ClusterMdRecoveryMode,
): string {
  const name = normalizeArrayName(arrayName)
  if (recoveryMode === 'assemble_missing_only') {
    return `ASSEMBLE ${name} ON STOPPED CLUSTER NODES`
  }
  return `ASSEMBLE ${name}`
}

export function isSymmetricRecoveryMode(mode: ClusterMdRecoveryMode): boolean {
  return mode === 'stop_all_active' || mode === 'assemble_stopped_nodes'
}

export const SKIP_REASON = {
  already_absent: 'already_absent',
  not_active: 'not_active',
  unreachable: 'unreachable',
  already_active: 'already_active',
  no_metadata: 'no_metadata',
  blocked: 'blocked',
} as const

export type ClusterMdSkipReason = typeof SKIP_REASON[keyof typeof SKIP_REASON]

export function skipReasonForStopState(state: MdArrayNodeState): ClusterMdSkipReason | undefined {
  switch (state) {
    case 'missing':
    case 'stopped':
    case 'metadata_only':
    case 'inactive_device':
      return SKIP_REASON.not_active
    case 'unreachable':
      return SKIP_REASON.unreachable
    case 'error':
      return SKIP_REASON.blocked
    default:
      return undefined
  }
}

export function skipReasonForAssembleState(state: MdArrayNodeState): ClusterMdSkipReason | undefined {
  switch (state) {
    case 'active':
      return SKIP_REASON.already_active
    case 'missing':
      return SKIP_REASON.no_metadata
    case 'unreachable':
      return SKIP_REASON.unreachable
    case 'metadata_only':
    case 'inactive_device':
      return undefined
    case 'stopped':
      return undefined
    case 'error':
      return SKIP_REASON.blocked
    default:
      return undefined
  }
}

export function humanSkipReason(reason: ClusterMdSkipReason, locale: 'fr' | 'en' = 'fr'): string {
  const fr: Record<ClusterMdSkipReason, string> = {
    already_absent: 'Déjà absent / non actif sur ce nœud',
    not_active: 'Tableau non actif sur ce nœud',
    unreachable: 'Ignoré — SSH indisponible',
    already_active: 'Déjà actif sur ce nœud',
    no_metadata: 'Aucune métadonnée arrêtée — réparation requise',
    blocked: 'Bloqué sur ce nœud',
  }
  const en: Record<ClusterMdSkipReason, string> = {
    already_absent: 'Already absent / not active on this node',
    not_active: 'Array not active on this node',
    unreachable: 'Skipped — SSH unavailable',
    already_active: 'Already active on this node',
    no_metadata: 'No stopped metadata — repair required',
    blocked: 'Blocked on this node',
  }
  return (locale === 'en' ? en : fr)[reason]
}

export function computeClusterMdPlanToken(input: {
  action: ClusterMdPreflightAction
  arrayName: string
  recoveryMode: ClusterMdRecoveryMode
  primarySanId: string
  nodeReports: MdArrayNodeStateReport[]
}): string {
  const payload = JSON.stringify({
    action: input.action,
    arrayName: input.arrayName,
    recoveryMode: input.recoveryMode,
    primarySanId: input.primarySanId,
    nodes: input.nodeReports.map(r => ({ sanId: r.sanId, state: r.state })),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

export function validateClusterMdPlanToken(
  token: string | undefined,
  expected: string,
): void {
  if (!token || token !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: 'planToken invalide ou expiré — regénérez le plan',
    })
  }
}

export async function runExecuteNodePreflight(
  action: 'stop_md' | 'assemble_md',
  payload: Record<string, unknown>,
  node: ClusterStorageNodeInventory,
): Promise<RaidPreflightResult> {
  return await runNodePreflight(action, payload, node)
}
