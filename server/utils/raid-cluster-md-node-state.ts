/**
 * Per-node MD array state classification and cluster recovery assessment
 * for degraded HA clusters (asymmetric active/stopped/missing across nodes).
 */
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { MD_ARRAY_PATH_RE } from './raid-md-detection'
import { runNodePreflight } from './raid-cluster-storage-preflight'
import type {
  ClusterMdPreflightAction,
  ClusterMdRecoveryMode,
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
}

export type { ClusterMdRecoveryMode } from './raid-types'

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

function activeUuids(reports: MdArrayNodeStateReport[]): string[] {
  return reports
    .filter(r => r.state === 'active' && r.uuid)
    .map(r => r.uuid!)
}

export function buildStopRecoveryAssessment(
  nodeReports: MdArrayNodeStateReport[],
  arrayName: string,
): Pick<ClusterMdRecoveryAssessment, 'hardBlockers' | 'warnings' | 'allowedRecoveryModes' | 'recommendedRecoveryMode' | 'okSymmetric' | 'okDegraded'> {
  const hardBlockers: string[] = []
  const warnings: string[] = []
  const activeReports = nodeReports.filter(r => r.state === 'active')
  const activeClean = activeReports.filter(r => r.nodeBlockers.length === 0)

  const uuids = activeUuids(nodeReports)
  const uniqueUuids = [...new Set(uuids)]
  if (uniqueUuids.length > 1) {
    hardBlockers.push(`UUID MD incohérents entre nœuds actifs pour ${arrayName} : ${uniqueUuids.join(', ')}`)
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

  if (activeClean.length === nodeReports.length && nodeReports.length > 0 && nodeReports.every(r => r.state === 'active')) {
    allowedRecoveryModes.push('stop_all_active')
  }

  if (activeClean.length >= 1 && activeClean.length < nodeReports.length) {
    allowedRecoveryModes.push('stop_active_only')
  } else if (activeClean.length >= 1 && nodeReports.some(r => r.state !== 'active')) {
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
    recommendedRecoveryMode = okSymmetric ? 'stop_all_active' : 'stop_active_only'
  }

  return {
    hardBlockers: [...new Set(hardBlockers)],
    warnings,
    allowedRecoveryModes,
    recommendedRecoveryMode,
    okSymmetric,
    okDegraded,
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
    ? buildStopRecoveryAssessment(nodeReports, input.arrayName)
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
