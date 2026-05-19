import { and, eq, inArray } from 'drizzle-orm'
import { createError } from 'h3'
import { getDB } from '../db'
import { sans } from '../db/schema'
import { getSSHPool } from './ssh-pool'
import { collectRaidOverview } from './raid-overview.service'
import { prefixBlockerRefs } from './raid-md-detection'
import { buildClusterMdRecoveryAssessment } from './raid-cluster-md-node-state'
import { buildLocalRecoveryOffered } from './raid-local-recovery'
import { runPreflight } from './raid-preflight'
import { buildMdCreateCommand, MD_CREATE_EMPTY_MEMBERS_MESSAGE } from './raid-md-validation'
import type {
  ClusterDiskMapping,
  ClusterDiskMappingCandidate,
  ClusterDiskMappingInput,
  ClusterStorageAction,
  ClusterStorageNodeInventory,
  ClusterStoragePreflightRequest,
  ClusterStoragePreflightResult,
  CreateMdArrayNodeResult,
  CreateMdArrayRequest,
  PrepareMdPartitionsNodePlan,
  PrepareMdPartitionsRequest,
  RaidBlockDevice,
  RaidPreflightRequest,
} from './raid-types'

export const SYNC_LIMITATIONS = [
  'Sync config exécute conf_sync.sh et synchronise des fichiers/configuration uniquement.',
  'Sync config ne crée pas de partitions physiques, superblocks MD, métadonnées LVM ni block devices sur les autres nœuds.',
  'Sync config n\'arrête ni ne démarre pas les tableaux MD (mdadm stop/assemble) sur les nœuds pairs.',
]

export const CLUSTER_MD_ACTIONS: ClusterStorageAction[] = [
  'prepare_md_partitions',
  'create_md',
  'stop_md',
  'assemble_md',
  'zero_md_superblocks',
  'wipe_md_signatures',
]

function isPathlessClusterAction(action: ClusterStorageAction): boolean {
  return action === 'stop_md'
}

function isDegradedRecoveryAction(action: ClusterStorageAction): boolean {
  return action === 'stop_md' || action === 'assemble_md'
}

function isMissingArrayBlocker(message: string, arrayName: string): boolean {
  return message.includes(`Array ${arrayName} introuvable`)
    || message.includes(`Tableau MD arrêté ${arrayName} introuvable`)
    || message.includes(`Le tableau ${arrayName} est déjà actif`)
}

interface ClusterSanRow {
  id: string
  label: string
  clusterRole: string | null
  readOnly: boolean
}

export async function collectClusterStorageInventory(input: {
  clusterId?: string
  nodeIds?: string[]
}): Promise<ClusterStorageNodeInventory[]> {
  const nodes = resolveClusterNodes(input)
  return await Promise.all(nodes.map(collectNodeInventory))
}

export async function runClusterStoragePreflight(
  req: ClusterStoragePreflightRequest,
): Promise<ClusterStoragePreflightResult> {
  if (!req.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId requis' })
  }
  if (!CLUSTER_MD_ACTIONS.includes(req.action)) {
    throw createError({ statusCode: 400, statusMessage: `Action cluster storage invalide : ${String(req.action)}` })
  }

  const nodes = resolveClusterNodes({ clusterId: req.clusterId, nodeIds: req.nodeIds })
  if (nodes.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'Au moins deux nœuds cluster sont requis pour le préflight stockage' })
  }
  if (!nodes.some(n => n.id === req.primarySanId)) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId ne fait pas partie du cluster demandé' })
  }

  const inventories = await Promise.all(nodes.map(collectNodeInventory))
  const source = inventories.find(n => n.sanId === req.primarySanId)
  const blockers: string[] = []
  const blockerRefs: import('./raid-types').PreflightBlockerRef[] = []
  const warnings = [...SYNC_LIMITATIONS]
  const perNodePreflights: Record<string, Awaited<ReturnType<typeof runPreflight>>> = {}
  const mappings: ClusterDiskMapping[] = []
  blockers.push(...duplicateManualMappingBlockers(req.diskMappings ?? []))

  for (const node of inventories) {
    if (!node.sshReady) blockers.push(`${node.label} : SSH non disponible${node.error ? ` (${node.error})` : ''}`)
    if (node.readOnly) blockers.push(`${node.label} : SAN en lecture seule`)
  }
  if (!source || !source.sshReady || !source.tools) {
    blockers.push('Inventaire du nœud source indisponible')
  } else {
    const degradedRecovery = isDegradedRecoveryAction(req.action)
    const arrayNameForRecovery = degradedRecovery
      ? String((req.payload as Record<string, unknown>)?.name ?? '')
      : ''
    const sourcePreflight = await runNodePreflight(req.action, req.payload, source)
    perNodePreflights[source.sanId] = sourcePreflight
    for (const b of sourcePreflight.blockers) {
      if (degradedRecovery && isMissingArrayBlocker(b, arrayNameForRecovery)) continue
      blockers.push(`${source.label} : ${b}`)
    }
    blockerRefs.push(...prefixBlockerRefs(sourcePreflight.blockerRefs ?? [], source.label, source.sanId))
    warnings.push(...sourcePreflight.warnings.map(w => `${source.label} : ${w}`))

    const selectedPaths = selectedStoragePaths(req.action, req.payload)
    for (const peer of inventories.filter(n => n.sanId !== source.sanId)) {
      if (!peer.sshReady || !peer.tools) continue

      if (isPathlessClusterAction(req.action) || (degradedRecovery && req.action === 'assemble_md' && selectedPaths.length === 0)) {
        const peerPreflight = await runNodePreflight(req.action, req.payload, peer)
        perNodePreflights[peer.sanId] = peerPreflight
        for (const b of peerPreflight.blockers) {
          if (degradedRecovery && isMissingArrayBlocker(b, arrayNameForRecovery)) continue
          blockers.push(`${peer.label} : ${b}`)
        }
        blockerRefs.push(...prefixBlockerRefs(peerPreflight.blockerRefs ?? [], peer.label, peer.sanId))
        warnings.push(...peerPreflight.warnings.map(w => `${peer.label} : ${w}`))
        continue
      }

      const peerPaths: string[] = []
      for (const sourcePath of selectedPaths) {
        const mapping = mapDeviceToPeer(
          sourcePath,
          source,
          peer,
          req.action,
          req.diskMappings ?? [],
        )
        mappings.push(mapping)
        if (mapping.targetPath) peerPaths.push(mapping.targetPath)
        blockers.push(...mapping.blockers.map(b => `${peer.label} : ${b}`))
        warnings.push(...mapping.warnings.map(w => `${peer.label} : ${w}`))
      }

      if (selectedPaths.length === 0) {
        blockers.push(`${peer.label} : aucun chemin membre à mapper pour ${req.action}`)
        continue
      }

      if (peerPaths.length === selectedPaths.length) {
        const peerPayload = remapPayload(req.action, req.payload, peerPaths)
        const peerPreflight = await runNodePreflight(req.action, peerPayload, peer)
        perNodePreflights[peer.sanId] = peerPreflight
        blockers.push(...peerPreflight.blockers.map(b => `${peer.label} : ${b}`))
        blockerRefs.push(...prefixBlockerRefs(peerPreflight.blockerRefs ?? [], peer.label, peer.sanId))
        warnings.push(...peerPreflight.warnings.map(w => `${peer.label} : ${w}`))
      } else {
        blockers.push(`${peer.label} : mapping incomplet (${peerPaths.length}/${selectedPaths.length} chemins)`)
      }
    }

    if (req.action === 'stop_md') {
      const arrayName = String((req.payload as Record<string, unknown>)?.name ?? '')
      const activeUuids = inventories
        .map(n => n.mdArrays.find(a => a.name === arrayName)?.uuid)
        .filter((u): u is string => Boolean(u))
      const uniqueUuids = [...new Set(activeUuids)]
      if (uniqueUuids.length > 1) {
        blockers.push(`UUID MD incohérents entre nœuds pour ${arrayName} : ${uniqueUuids.join(', ')}`)
      }
    }
  }

  let recoveryAssessment: import('./raid-types').ClusterMdRecoveryAssessment | undefined
  if (isDegradedRecoveryAction(req.action)) {
    const arrayName = String((req.payload as Record<string, unknown>)?.name ?? '')
    const uuid = (req.payload as Record<string, unknown>)?.uuid as string | undefined
    recoveryAssessment = buildClusterMdRecoveryAssessment({
      action: req.action,
      arrayName,
      uuid,
      nodes: inventories,
    })
    blockers.push(...recoveryAssessment.hardBlockers)
    warnings.push(...recoveryAssessment.warnings)
  }

  if (req.action === 'create_md') {
    for (const node of inventories) {
      if (node.tools && !node.tools.mdadm) blockers.push(`${node.label} : mdadm indisponible`)
    }
  }

  const uniqueBlockers = [...new Set(blockers)]
  const uniqueWarnings = [...new Set(warnings)]
  const okSymmetric = recoveryAssessment?.okSymmetric ?? (uniqueBlockers.length === 0)
  const okDegraded = recoveryAssessment?.okDegraded ?? false
  const ok = isDegradedRecoveryAction(req.action)
    ? (okDegraded || (uniqueBlockers.length === 0 && okSymmetric))
    : uniqueBlockers.length === 0

  const preflightResult: ClusterStoragePreflightResult = {
    ok,
    okSymmetric,
    okDegraded,
    action: req.action,
    sourceSanId: req.primarySanId,
    blockers: uniqueBlockers,
    blockerRefs,
    warnings: uniqueWarnings,
    syncLimitations: SYNC_LIMITATIONS,
    nodes: inventories,
    mappings,
    perNodePreflights,
    executionModesAllowed: executionModes(uniqueBlockers, mappings),
    recoveryAssessment,
  }

  const localRecoveryOffered = buildLocalRecoveryOffered(preflightResult)
  if (localRecoveryOffered) {
    preflightResult.localRecoveryOffered = localRecoveryOffered
  }

  return preflightResult
}

export async function buildPrepareMdPartitionsClusterExecutionPlan(
  req: PrepareMdPartitionsRequest,
): Promise<{
  preflight: ClusterStoragePreflightResult
  nodePlans: PrepareMdPartitionsNodePlan[]
}> {
  const clusterExecution = req.clusterExecution
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.primarySanId requis' })
  }
  if (clusterExecution.requirePreflightOk !== true) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.requirePreflightOk=true requis' })
  }

  const payload = prepareMdPartitionsPayload(req)
  const preflight = await runClusterStoragePreflight({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    action: 'prepare_md_partitions',
    payload,
    diskMappings: clusterExecution.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight stockage cluster non validé : ${preflight.blockers.join('; ')}`,
    })
  }

  return {
    preflight,
    nodePlans: buildPrepareMdPartitionsNodePlans(preflight, req),
  }
}

export function buildPrepareMdPartitionsNodePlans(
  preflight: ClusterStoragePreflightResult,
  req: PrepareMdPartitionsRequest,
): PrepareMdPartitionsNodePlan[] {
  const clusterExecution = req.clusterExecution
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.primarySanId requis' })
  }
  if (preflight.sourceSanId !== clusterExecution.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'Le préflight cluster ne correspond pas au nœud source demandé' })
  }
  const payload = prepareMdPartitionsPayload(req)
  const selectedPaths = selectedStoragePaths('prepare_md_partitions', payload)
  const blockers: string[] = []
  const nodePlans: PrepareMdPartitionsNodePlan[] = []
  const nodes = [
    ...preflight.nodes.filter(node => node.sanId === clusterExecution.primarySanId),
    ...preflight.nodes.filter(node => node.sanId !== clusterExecution.primarySanId),
  ]

  for (const node of nodes) {
    const disks = node.sanId === clusterExecution.primarySanId
      ? selectedPaths
      : selectedPaths.map((sourcePath) => {
          const mapping = preflight.mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
          if (!mapping?.targetPath) {
            blockers.push(`${node.label} : mapping manquant pour ${sourcePath}`)
            return ''
          }
          if (mapping.confidence === 'none' || mapping.blockers.length > 0) {
            blockers.push(`${node.label} : mapping invalide pour ${sourcePath}`)
          }
          return mapping.targetPath
        })

    if (disks.some(d => !d)) continue
    const nodePreflight = preflight.perNodePreflights[node.sanId]
    if (!nodePreflight?.ok) {
      blockers.push(`${node.label} : préflight nœud indisponible ou bloquant`)
      continue
    }
    const commands = nodePreflight.commandPreview?.split('\n').filter(Boolean) ?? []
    nodePlans.push({
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === clusterExecution.primarySanId ? 'primary' : 'peer',
      disks,
      commands,
      preparedPartitions: nodePreflight.preparedPartitionPreview?.map(p => p.expectedPartitionPath) ?? [],
      preflight: nodePreflight,
      status: 'pending',
    })
  }

  if (nodePlans.length !== preflight.nodes.length) {
    blockers.push('Plan multi-nœud incomplet : tous les nœuds du cluster doivent être planifiés')
  }
  if (blockers.length > 0) {
    throw createError({ statusCode: 409, statusMessage: blockers.join('; ') })
  }
  return nodePlans
}

export async function buildCreateMdArrayClusterExecutionPlan(
  req: CreateMdArrayRequest,
): Promise<{
  preflight: ClusterStoragePreflightResult
  nodeResults: CreateMdArrayNodeResult[]
}> {
  const clusterExecution = req.clusterExecution
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.primarySanId requis' })
  }
  if (clusterExecution.requirePreflightOk !== true) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.requirePreflightOk=true requis' })
  }

  const payload = createMdPayload(req)
  const preflight = await runClusterStoragePreflight({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    action: 'create_md',
    payload,
    diskMappings: clusterExecution.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight stockage cluster non validé : ${preflight.blockers.join('; ')}`,
    })
  }

  return { preflight, nodeResults: buildCreateMdArrayNodeResults(preflight, req) }
}

export function buildCreateMdArrayNodeResults(
  preflight: ClusterStoragePreflightResult,
  req: CreateMdArrayRequest,
): CreateMdArrayNodeResult[] {
  const clusterExecution = req.clusterExecution
  if (!clusterExecution?.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.primarySanId requis' })
  }
  if (preflight.sourceSanId !== clusterExecution.primarySanId) {
    throw createError({ statusCode: 400, statusMessage: 'Le préflight cluster ne correspond pas au nœud source demandé' })
  }
  const payload = createMdPayload(req)
  const selectedPaths = selectedStoragePaths('create_md', payload)
  const blockers: string[] = []
  const nodeResults: CreateMdArrayNodeResult[] = []
  if (selectedPaths.length === 0) {
    blockers.push(MD_CREATE_EMPTY_MEMBERS_MESSAGE)
  }
  const nodes = [
    ...preflight.nodes.filter(node => node.sanId === clusterExecution.primarySanId),
    ...preflight.nodes.filter(node => node.sanId !== clusterExecution.primarySanId),
  ]

  for (const node of nodes) {
    const devices = node.sanId === clusterExecution.primarySanId
      ? selectedPaths
      : selectedPaths.map((sourcePath) => {
          const mapping = preflight.mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
          if (!mapping?.targetPath) {
            blockers.push(`${node.label} : mapping manquant pour ${sourcePath}`)
            return ''
          }
          if (mapping.confidence === 'none' || mapping.blockers.length > 0) {
            blockers.push(`${node.label} : mapping invalide pour ${sourcePath}`)
          }
          return mapping.targetPath
        })

    if (devices.length === 0) {
      blockers.push(`${node.label} : ${MD_CREATE_EMPTY_MEMBERS_MESSAGE}`)
      continue
    }
    if (devices.some(d => !d)) continue
    if (devices.length !== selectedPaths.length) {
      blockers.push(`${node.label} : nombre de membres mappés incohérent (${devices.length}/${selectedPaths.length})`)
      continue
    }
    const nodePreflight = preflight.perNodePreflights[node.sanId]
    if (!nodePreflight?.ok) {
      blockers.push(`${node.label} : préflight nœud indisponible ou bloquant`)
      continue
    }
    let command = ''
    try {
      command = buildMdCreateCommand({ ...req, devices })
    } catch (err: any) {
      blockers.push(`${node.label} : ${err?.statusMessage ?? err?.message ?? 'commande mdadm invalide'}`)
      continue
    }
    nodeResults.push({
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === clusterExecution.primarySanId ? 'primary' : 'peer',
      devices,
      command,
      status: 'pending',
    })
  }

  if (nodeResults.length !== preflight.nodes.length) {
    blockers.push('Plan création MD multi-nœud incomplet : tous les nœuds du cluster doivent être planifiés')
  }
  if (blockers.length > 0) {
    const validationFailure = blockers.some(blocker =>
      blocker.includes('Au moins un device membre')
      || blocker.includes(MD_CREATE_EMPTY_MEMBERS_MESSAGE)
      || blocker.includes('nombre de membres mappés incohérent')
      || blocker.includes('commande mdadm invalide')
      || blocker.includes('RAID')
    )
    throw createError({ statusCode: validationFailure ? 400 : 409, statusMessage: blockers.join('; ') })
  }
  return nodeResults
}

function resolveClusterNodes(input: { clusterId?: string; nodeIds?: string[] }): ClusterSanRow[] {
  const db = getDB()
  if (input.nodeIds?.length) {
    return db
      .select({
        id: sans.id,
        label: sans.label,
        clusterRole: sans.clusterRole,
        readOnly: sans.readOnly,
      })
      .from(sans)
      .where(inArray(sans.id, input.nodeIds))
      .all()
  }
  if (!input.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId ou nodeIds requis' })
  }
  return db
    .select({
      id: sans.id,
      label: sans.label,
      clusterRole: sans.clusterRole,
      readOnly: sans.readOnly,
    })
    .from(sans)
    .where(and(eq(sans.clusterId, input.clusterId), eq(sans.clusterEnabled, true)))
    .all()
}

async function collectNodeInventory(node: ClusterSanRow): Promise<ClusterStorageNodeInventory> {
  const pool = getSSHPool()
  const manager = pool.get(node.id)
  if (!manager || manager.getStatus() !== 'connected') {
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: false,
      error: 'SSH non connecté',
      blockDevices: [],
      mdArrays: [],
      stoppedMdArrays: [],
    }
  }

  try {
    const overview = await collectRaidOverview(manager)
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: true,
      tools: overview.tools,
      blockDevices: overview.blockDevices,
      mdArrays: overview.mdArrays,
      stoppedMdArrays: overview.stoppedMdArrays ?? [],
    }
  } catch (err: any) {
    return {
      sanId: node.id,
      label: node.label,
      role: node.clusterRole,
      readOnly: node.readOnly,
      sshReady: false,
      error: err?.statusMessage ?? err?.message ?? 'Inventaire RAID indisponible',
      blockDevices: [],
      mdArrays: [],
      stoppedMdArrays: [],
    }
  }
}

export async function runNodePreflight(
  action: ClusterStorageAction,
  payload: unknown,
  node: ClusterStorageNodeInventory,
) {
  return await runPreflight(
    undefined as any,
    { backend: 'software_md', action, payload } as RaidPreflightRequest,
    node.blockDevices,
    node.mdArrays,
    node.tools,
    node.stoppedMdArrays ?? [],
    { sanId: node.sanId },
  )
}

function selectedStoragePaths(action: ClusterStorageAction, payload: unknown): string[] {
  const p = payload as Record<string, unknown>
  if (action === 'prepare_md_partitions') {
    return Array.isArray(p.disks) ? p.disks.filter(v => typeof v === 'string') as string[] : []
  }
  if (action === 'create_md') {
    return Array.isArray(p.devices) ? p.devices.filter(v => typeof v === 'string') as string[] : []
  }
  if (action === 'stop_md') return []
  if (action === 'assemble_md' || action === 'zero_md_superblocks' || action === 'wipe_md_signatures') {
    return Array.isArray(p.members) ? p.members.filter(v => typeof v === 'string') as string[] : []
  }
  return []
}

function remapPayload(action: ClusterStorageAction, payload: unknown, mappedPaths: string[]): unknown {
  const p = { ...(payload as Record<string, unknown>) }
  if (action === 'prepare_md_partitions') p.disks = mappedPaths
  else if (action === 'create_md') p.devices = mappedPaths
  else if (action === 'assemble_md' || action === 'zero_md_superblocks' || action === 'wipe_md_signatures') {
    p.members = mappedPaths
  }
  return p
}

function prepareMdPartitionsPayload(req: PrepareMdPartitionsRequest): Record<string, unknown> {
  return {
    disks: req.disks,
    partitionTable: req.partitionTable,
    allowOverwriteSignatures: req.allowOverwriteSignatures,
  }
}

function createMdPayload(req: CreateMdArrayRequest): Record<string, unknown> {
  return {
    name: req.name,
    level: req.level,
    chunkKb: req.chunkKb,
    devices: req.devices,
  }
}

export function mapDeviceToPeer(
  sourcePath: string,
  source: ClusterStorageNodeInventory,
  peer: ClusterStorageNodeInventory,
  action: ClusterStorageAction,
  manualMappings: ClusterDiskMappingInput[] = [],
): ClusterDiskMapping {
  const manual = manualMappings.find(m => m.sourcePath === sourcePath && m.targetSanId === peer.sanId)
  const sourceDevice = source.blockDevices.find(d => d.path === sourcePath)
  const blockers: string[] = []
  const warnings: string[] = []
  const evidence: string[] = []
  if (!sourceDevice) {
    return { sourcePath, targetSanId: peer.sanId, confidence: 'none', evidence, warnings, blockers: [`${sourcePath} introuvable sur le nœud source`] }
  }
  const candidates = peer.blockDevices.filter(d => d.type === sourceDevice.type)
  const mappingCandidates = buildMappingCandidates(sourceDevice, candidates)

  if (manual) {
    const target = peer.blockDevices.find(d => d.path === manual.targetPath)
    if (!target) blockers.push(action === 'create_md'
      ? `expected partition not found on peer node: ${manual.targetPath}`
      : `mapping manuel introuvable ${sourcePath} -> ${manual.targetPath}`)
    else if (target.type !== sourceDevice.type) blockers.push(`mapping manuel ${sourcePath} -> ${target.path} : type incompatible (${target.type} au lieu de ${sourceDevice.type})`)
    else evidence.push(isOperatorConfirmedMapping(manual, action)
      ? 'mapping confirmé par l’opérateur lors de la préparation des disques'
      : 'mapping manuel opérateur')
    const confirmed = target && target.type === sourceDevice.type && isOperatorConfirmedMapping(manual, action)
    return {
      sourcePath,
      targetSanId: peer.sanId,
      targetPath: target?.type === sourceDevice.type ? target.path : undefined,
      confidence: target && target.type === sourceDevice.type ? (confirmed ? 'high' : 'low') : 'none',
      evidence,
      warnings: target && target.type === sourceDevice.type && !confirmed ? [`Mapping manuel faible confiance : vérifier ${sourcePath} -> ${target.path}`] : warnings,
      blockers,
      candidates: mappingCandidates,
    }
  }

  const stable = findStableMatch(sourceDevice, candidates)
  if (stable) {
    return { sourcePath, targetSanId: peer.sanId, targetPath: stable.path, confidence: 'high', evidence: stable.evidence, warnings, blockers }
  }

  const compatible = candidates.filter(d => compatibleByShape(sourceDevice, d))
  if (compatible.length === 1) {
    return {
      sourcePath,
      targetSanId: peer.sanId,
      targetPath: compatible[0].path,
      confidence: 'medium',
      evidence: ['taille/modèle/vendor/transport compatibles'],
      warnings,
      blockers,
    }
  }

  const sizeOnly = candidates.filter(d => d.sizeBytes === sourceDevice.sizeBytes)
  if (sizeOnly.length === 1) {
    return {
      sourcePath,
      targetSanId: peer.sanId,
      targetPath: sizeOnly[0].path,
      confidence: 'low',
      evidence: ['taille identique uniquement'],
      warnings: [`Mapping faible confiance pour ${sourcePath} vers ${sizeOnly[0].path}; cas VMware possible, validation manuelle recommandée`],
      blockers,
    }
  }

  blockers.push(compatible.length > 1 || sizeOnly.length > 1
    ? `mapping ambigu pour ${sourcePath} (${Math.max(compatible.length, sizeOnly.length)} candidats)`
    : `aucun équivalent trouvé pour ${sourcePath}`)
  return { sourcePath, targetSanId: peer.sanId, confidence: 'none', evidence, warnings, blockers, candidates: mappingCandidates }
}

export function duplicateManualMappingBlockers(mappings: ClusterDiskMappingInput[]): string[] {
  const byTarget = new Map<string, ClusterDiskMappingInput[]>()
  for (const mapping of mappings) {
    const key = `${mapping.targetSanId}:${mapping.targetPath}`
    byTarget.set(key, [...(byTarget.get(key) ?? []), mapping])
  }
  return [...byTarget.values()]
    .filter(group => group.length > 1)
    .map(group => `Mapping manuel dupliqué sur ${group[0].targetSanId}:${group[0].targetPath} pour ${group.map(g => g.sourcePath).join(', ')}`)
}

function buildMappingCandidates(source: RaidBlockDevice, candidates: RaidBlockDevice[]): ClusterDiskMappingCandidate[] {
  const compatible = candidates.filter(d => compatibleByShape(source, d))
  if (compatible.length > 0) {
    return compatible.map(d => ({
      path: d.path,
      confidence: 'medium',
      evidence: ['taille/modèle/vendor/transport compatibles'],
      warnings: [],
    }))
  }
  return candidates
    .filter(d => d.sizeBytes === source.sizeBytes)
    .map(d => ({
      path: d.path,
      confidence: 'low',
      evidence: ['taille identique uniquement'],
      warnings: ['Correspondance faible confiance; vérification opérateur requise'],
    }))
}

function findStableMatch(source: RaidBlockDevice, candidates: RaidBlockDevice[]): (RaidBlockDevice & { evidence: string[] }) | null {
  const sourceStable = stableIdentifiers(source)
  for (const candidate of candidates) {
    const evidence = stableIdentifiers(candidate).filter(id => sourceStable.includes(id))
    if (evidence.length > 0) return { ...candidate, evidence: evidence.map(e => `identifiant stable ${e}`) }
  }
  return null
}

function stableIdentifiers(dev: RaidBlockDevice): string[] {
  return [
    dev.wwn && `wwn:${dev.wwn}`,
    dev.serial && `serial:${dev.serial}`,
    dev.idSerial && `id_serial:${dev.idSerial}`,
    ...(dev.byIdPaths ?? []).map(p => `by-id:${p.split('/').pop()}`),
  ].filter(Boolean) as string[]
}

function compatibleByShape(a: RaidBlockDevice, b: RaidBlockDevice): boolean {
  return a.sizeBytes === b.sizeBytes
    && normalize(a.model) === normalize(b.model)
    && normalize(a.vendor) === normalize(b.vendor)
    && normalize(a.transport) === normalize(b.transport)
    && a.rotational === b.rotational
}

function normalize(value?: string): string {
  return (value ?? '').trim().toLowerCase()
}

function executionModes(blockers: string[], mappings: ClusterDiskMapping[]): ClusterStoragePreflightResult['executionModesAllowed'] {
  if (blockers.length > 0) return []
  if (mappings.some(m => m.confidence === 'none')) return []
  if (mappings.some(m => m.confidence === 'low')) return ['staged']
  return ['all_nodes', 'staged']
}

function isOperatorConfirmedMapping(mapping: ClusterDiskMappingInput, action: ClusterStorageAction): boolean {
  return mapping.confirmedBy === 'operator'
    || (action === 'create_md' && mapping.confirmedBy === 'derived_from_operator_disk_mapping' && mapping.sourceKind === 'partition')
}
