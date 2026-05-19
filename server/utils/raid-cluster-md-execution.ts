/**
 * Cluster-aware execution for MD stop, assemble, and metadata cleanup.
 */
import { createError } from 'h3'
import { getSanSummary } from '../db/repositories/san.repository'
import { invalidateCacheKey } from './cache'
import {
  assembleMdArray,
  buildMdAssembleCommand,
  expectedCurrentNodeOnlyStopConfirmation,
  expectedMdAssembleConfirmation,
  expectedMdZeroMetadataConfirmation,
  expectedMdAdvancedCleanupConfirmation,
  stopMdArray,
  validateWipeSignatureMembers,
  validateZeroSuperblockMembers,
  wipeMdSignatures,
  zeroMdSuperblocks,
} from './raid-md-actions'
import { runClusterStoragePreflight } from './raid-cluster-storage-preflight'
import { collectRaidOverview } from './raid-overview.service'
import { getActiveSSHManager, withSanContext } from './ssh-runtime'
function normalizeMdArrayName(name: string): string {
  const trimmed = name.trim()
  if (!/^md[a-z0-9_-]{0,15}$/i.test(trimmed)) {
    throw createError({ statusCode: 400, statusMessage: `Nom MD invalide : ${name}` })
  }
  return trimmed
}
import type {
  AssembleMdArrayRequest,
  ClusterDiskMappingInput,
  ClusterMdExecutionPlan,
  ClusterMdExecutionRequest,
  ClusterMdExecutionResult,
  ClusterMdNodeResult,
  ClusterMdPreflightAction,
  ClusterStoragePreflightResult,
  StopMdArrayRequest,
  WipeMdSignaturesRequest,
  ZeroMdSuperblocksRequest,
} from './raid-types'

export const CLUSTER_MD_BLOCKED_MESSAGE =
  'Action MD bloquée pour SAN clusterisé : validez le stockage sur tous les nœuds et utilisez le flux multi-nœud. Une exécution sur un seul nœud créerait un état cluster incohérent. Sync config n\'arrête ni ne démarre pas les tableaux MD sur les pairs.'

export function assertClusteredSanAllowsMutation(
  sanId: string,
  clusterExecution: ClusterMdExecutionRequest | undefined,
): { clusterId: string; san: NonNullable<ReturnType<typeof getSanSummary>> } | null {
  const san = getSanSummary(sanId)
  if (!san?.clusterId) return null
  if (!clusterExecution) {
    throw createError({ statusCode: 409, statusMessage: CLUSTER_MD_BLOCKED_MESSAGE })
  }
  if (clusterExecution.primarySanId !== sanId) {
    throw createError({ statusCode: 400, statusMessage: 'primarySanId doit correspondre au SAN courant' })
  }
  if (clusterExecution.clusterId && clusterExecution.clusterId !== san.clusterId) {
    throw createError({ statusCode: 400, statusMessage: 'clusterId ne correspond pas au SAN courant' })
  }
  if (clusterExecution.requirePreflightOk !== true) {
    throw createError({ statusCode: 400, statusMessage: 'clusterExecution.requirePreflightOk=true requis' })
  }
  return { clusterId: san.clusterId, san }
}

export function validateClusterExecutionScope(
  clusterExecution: ClusterMdExecutionRequest,
  confirmation: string,
  arrayNameForOverride?: string,
): void {
  if (clusterExecution.executionScope !== 'current_node_only') return
  if (!arrayNameForOverride) {
    throw createError({
      statusCode: 400,
      statusMessage: 'current_node_only n\'est autorisé que pour l\'arrêt MD',
    })
  }
  const expected = expectedCurrentNodeOnlyStopConfirmation(arrayNameForOverride)
  if (confirmation !== expected) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation current_node_only invalide (attendu : "${expected}")`,
    })
  }
}

function orderClusterNodes(
  preflight: ClusterStoragePreflightResult,
  primarySanId: string,
): ClusterStoragePreflightResult['nodes'] {
  return [
    ...preflight.nodes.filter(n => n.sanId === primarySanId),
    ...preflight.nodes.filter(n => n.sanId !== primarySanId),
  ]
}

function buildClusterMdNodeResultsFromPreflight(
  preflight: ClusterStoragePreflightResult,
  primarySanId: string,
  buildNode: (node: ClusterStoragePreflightResult['nodes'][number]) => ClusterMdNodeResult | null,
): ClusterMdNodeResult[] {
  const blockers: string[] = []
  const nodeResults: ClusterMdNodeResult[] = []
  for (const node of orderClusterNodes(preflight, primarySanId)) {
    const built = buildNode(node)
    if (!built) {
      blockers.push(`${node.label} : plan nœud incomplet`)
      continue
    }
    const nodePreflight = preflight.perNodePreflights[node.sanId]
    if (!nodePreflight?.ok) {
      blockers.push(`${node.label} : préflight nœud bloquant`)
      continue
    }
    nodeResults.push(built)
  }
  if (nodeResults.length !== preflight.nodes.length) {
    throw createError({ statusCode: 409, statusMessage: blockers.join('; ') })
  }
  return nodeResults
}

export async function buildStopMdClusterExecutionPlan(input: {
  clusterId?: string
  primarySanId: string
  arrayName: string
  diskMappings?: ClusterDiskMappingInput[]
}): Promise<{ preflight: ClusterStoragePreflightResult; nodeResults: ClusterMdNodeResult[] }> {
  const name = normalizeMdArrayName(input.arrayName)
  const preflight = await runClusterStoragePreflight({
    clusterId: input.clusterId,
    primarySanId: input.primarySanId,
    action: 'stop_md',
    payload: { name },
    diskMappings: input.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight cluster stop MD non validé : ${preflight.blockers.join('; ')}`,
    })
  }
  const nodeResults = buildClusterMdNodeResultsFromPreflight(preflight, input.primarySanId, (node) => {
    const arr = node.mdArrays.find(a => a.name === name)
    if (!arr) return null
    const arrayPath = arr.path ?? `/dev/${name}`
    const members = arr.members.map(m => m.path)
    return {
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === input.primarySanId ? 'primary' : 'peer',
      arrayPath,
      members,
      devices: members,
      command: `mdadm --stop ${arrayPath}`,
      status: 'pending',
    }
  })
  return { preflight, nodeResults }
}

export async function buildAssembleMdClusterExecutionPlan(
  req: AssembleMdArrayRequest,
): Promise<{ preflight: ClusterStoragePreflightResult; nodeResults: ClusterMdNodeResult[] }> {
  const clusterExecution = req.clusterExecution!
  const effectiveName = req.targetName ?? req.name
  const sourceMembers = (req.members ?? []).map(String)
  const preflight = await runClusterStoragePreflight({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    action: 'assemble_md',
    payload: {
      name: req.name,
      uuid: req.uuid,
      members: sourceMembers,
      targetName: req.targetName,
    },
    diskMappings: clusterExecution.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight cluster assemble MD non validé : ${preflight.blockers.join('; ')}`,
    })
  }
  const primaryPreflight = preflight.perNodePreflights[clusterExecution.primarySanId]
  const selectedPaths = sourceMembers.length > 0
    ? sourceMembers
    : (primaryPreflight?.impactedDevices ?? [])

  const nodeResults = buildClusterMdNodeResultsFromPreflight(preflight, clusterExecution.primarySanId, (node) => {
    const members = node.sanId === clusterExecution.primarySanId
      ? selectedPaths
      : selectedPaths.map((sourcePath) => {
          const mapping = preflight.mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
          return mapping?.targetPath ?? ''
        })
    if (members.some(m => !m)) return null
    const command = buildMdAssembleCommand(effectiveName, members)
    return {
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === clusterExecution.primarySanId ? 'primary' : 'peer',
      arrayPath: `/dev/${effectiveName}`,
      members,
      devices: members,
      command,
      status: 'pending',
    }
  })
  return { preflight, nodeResults }
}

function buildMemberMappedNodeResults(
  action: 'zero_md_superblocks' | 'wipe_md_signatures',
  preflight: ClusterStoragePreflightResult,
  primarySanId: string,
  sourceMembers: string[],
  commandBuilder: (members: string[]) => string,
): ClusterMdNodeResult[] {
  return buildClusterMdNodeResultsFromPreflight(preflight, primarySanId, (node) => {
    const members = node.sanId === primarySanId
      ? sourceMembers
      : sourceMembers.map((sourcePath) => {
          const mapping = preflight.mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
          return mapping?.targetPath ?? ''
        })
    if (members.some(m => !m)) return null
    return {
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: node.sanId === primarySanId ? 'primary' : 'peer',
      members,
      devices: members,
      command: commandBuilder(members),
      status: 'pending',
    }
  })
}

export async function buildZeroMdClusterExecutionPlan(
  req: ZeroMdSuperblocksRequest,
): Promise<{ preflight: ClusterStoragePreflightResult; nodeResults: ClusterMdNodeResult[] }> {
  const clusterExecution = req.clusterExecution!
  const sourceMembers = req.members.map(String)
  if (sourceMembers.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'members requis' })
  }
  const preflight = await runClusterStoragePreflight({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    action: 'zero_md_superblocks',
    payload: { members: sourceMembers, name: req.name, uuid: req.uuid },
    diskMappings: clusterExecution.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight cluster zero MD non validé : ${preflight.blockers.join('; ')}`,
    })
  }
  for (const node of preflight.nodes) {
    const nodeMembers = node.sanId === clusterExecution.primarySanId
      ? sourceMembers
      : sourceMembers.map((sourcePath) => {
          const mapping = preflight.mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
          return mapping?.targetPath ?? ''
        })
    const activeOnMember = node.mdArrays.some(arr =>
      arr.members.some(m => nodeMembers.includes(m.path)),
    )
    if (activeOnMember) {
      throw createError({
        statusCode: 409,
        statusMessage: `${node.label} : tableau MD encore actif sur un membre — arrêtez le tableau sur tous les nœuds avant le nettoyage`,
      })
    }
  }
  const nodeResults = buildMemberMappedNodeResults(
    'zero_md_superblocks',
    preflight,
    clusterExecution.primarySanId,
    sourceMembers,
    members => members.map(m => `mdadm --zero-superblock ${m}`).join('\n'),
  )
  return { preflight, nodeResults }
}

export async function buildWipeMdClusterExecutionPlan(
  req: WipeMdSignaturesRequest,
): Promise<{ preflight: ClusterStoragePreflightResult; nodeResults: ClusterMdNodeResult[] }> {
  const clusterExecution = req.clusterExecution!
  const sourceMembers = req.members.map(String)
  const preflight = await runClusterStoragePreflight({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    action: 'wipe_md_signatures',
    payload: {
      mode: 'advanced',
      members: sourceMembers,
      remainingSignatureTypes: req.remainingSignatureTypes,
      detectionSourcesByMember: req.detectionSourcesByMember,
    },
    diskMappings: clusterExecution.diskMappings ?? [],
  })
  if (!preflight.ok) {
    throw createError({
      statusCode: 409,
      statusMessage: `Préflight cluster wipe MD non validé : ${preflight.blockers.join('; ')}`,
    })
  }
  const nodeResults = buildMemberMappedNodeResults(
    'wipe_md_signatures',
    preflight,
    clusterExecution.primarySanId,
    sourceMembers,
    members => members.map(m => `wipefs -a ${m}; mdadm --zero-superblock --force ${m}`).join('\n'),
  )
  return { preflight, nodeResults }
}

async function executeClusterMdNodes<T>(input: {
  action: ClusterMdPreflightAction
  clusterExecution: ClusterMdExecutionRequest
  nodeResults: ClusterMdNodeResult[]
  nodesToRun: ClusterMdNodeResult[]
  runOnNode: (node: ClusterMdNodeResult) => Promise<T>
  applySuccess: (node: ClusterMdNodeResult, result: T) => void
}): Promise<ClusterMdExecutionResult> {
  const refreshedSanIds = new Set<string>()
  const clusterResult: ClusterMdExecutionResult = {
    mode: 'cluster',
    action: input.action,
    clusterId: input.clusterExecution.clusterId,
    sourceSanId: input.clusterExecution.primarySanId,
    stopOnFirstFailure: true,
    executionScope: input.clusterExecution.executionScope ?? 'all_nodes',
    nodeResults: input.nodeResults,
    refreshedSanIds: [],
  }

  for (const node of input.nodesToRun) {
    if (!node.command) {
      node.status = 'failed'
      node.error = 'Commande planifiée manquante'
      clusterResult.failedSanId = node.sanId
      clusterResult.refreshedSanIds = [...refreshedSanIds]
      throw createError({
        statusCode: 400,
        statusMessage: `${node.label} : ${node.error}`,
        data: { clusterExecution: clusterResult },
      })
    }
    node.status = 'running'
    try {
      const result = await withSanContext(node.sanId, async () => {
        const manager = getActiveSSHManager()
        if (!manager?.isReady()) {
          throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
        }
        return await input.runOnNode(node)
      })
      input.applySuccess(node, result)
      node.status = 'success'
      refreshedSanIds.add(node.sanId)
      invalidateCacheKey(`raid-overview-${node.sanId}`)
    } catch (err: any) {
      node.status = 'failed'
      node.stdout = typeof err?.data?.stdout === 'string' ? err.data.stdout : node.stdout
      node.stderr = typeof err?.data?.stderr === 'string' ? err.data.stderr : node.stderr
      node.error = err?.statusMessage ?? err?.message ?? 'Erreur exécution cluster MD'
      clusterResult.failedSanId = node.sanId
      clusterResult.refreshedSanIds = [...refreshedSanIds]
      throw createError({
        statusCode: err?.statusCode ?? 500,
        statusMessage: `${node.label} : ${node.error}`,
        data: { clusterExecution: clusterResult },
      })
    }
  }

  clusterResult.refreshedSanIds = [...refreshedSanIds]
  return clusterResult
}

export async function runClusterStopMdArray(
  sanId: string,
  arrayName: string,
  body: StopMdArrayRequest,
): Promise<StopMdArrayRequest & { mode: 'cluster' | 'single_node_override'; stdout?: string; clusterExecution: ClusterMdExecutionResult }> {
  const clusterExecution = body.clusterExecution!
  const name = normalizeMdArrayName(arrayName)
  validateClusterExecutionScope(clusterExecution, body.confirmation, name)

  if (clusterExecution.executionScope === 'current_node_only') {
    const result = await withSanContext(sanId, async () => {
      const manager = getActiveSSHManager()
      if (!manager?.isReady()) throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
      return await stopMdArray(manager, name)
    })
    invalidateCacheKey(`raid-overview-${sanId}`)
    return {
      ...body,
      mode: 'single_node_override',
      stdout: result.stdout,
      clusterExecution: {
        mode: 'cluster',
        action: 'stop_md',
        clusterId: clusterExecution.clusterId,
        sourceSanId: clusterExecution.primarySanId,
        stopOnFirstFailure: true,
        executionScope: 'current_node_only',
        nodeResults: [{
          sanId,
          label: getSanSummary(sanId)?.label ?? sanId,
          role: getSanSummary(sanId)?.clusterRole ?? null,
          source: 'primary',
          arrayPath: `/dev/${name}`,
          members: [],
          devices: [],
          command: `mdadm --stop /dev/${name}`,
          status: 'success',
          stdout: result.stdout,
        }],
        refreshedSanIds: [sanId],
      },
    }
  }

  const { nodeResults } = await buildStopMdClusterExecutionPlan({
    clusterId: clusterExecution.clusterId,
    primarySanId: clusterExecution.primarySanId,
    arrayName: name,
    diskMappings: clusterExecution.diskMappings,
  })

  const clusterResult = await executeClusterMdNodes({
    action: 'stop_md',
    clusterExecution,
    nodeResults,
    nodesToRun: nodeResults,
    runOnNode: async (node) => {
      const manager = getActiveSSHManager()
      return await stopMdArray(manager, name)
    },
    applySuccess: (node, result) => {
      node.stdout = result.stdout
    },
  })

  return {
    ...body,
    mode: 'cluster',
    stdout: clusterResult.nodeResults.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
    clusterExecution: clusterResult,
  }
}

export async function runClusterAssembleMdArray(
  sanId: string,
  body: AssembleMdArrayRequest,
): Promise<AssembleMdArrayRequest & { mode: 'cluster'; clusterExecution: ClusterMdExecutionResult }> {
  const clusterExecution = body.clusterExecution!
  const effectiveName = body.targetName ?? body.name
  const expectedConfirm = expectedMdAssembleConfirmation(effectiveName)
  if (body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const { nodeResults } = await buildAssembleMdClusterExecutionPlan(body)
  const clusterResult = await executeClusterMdNodes({
    action: 'assemble_md',
    clusterExecution,
    nodeResults,
    nodesToRun: nodeResults,
    runOnNode: async (node) => {
      const manager = getActiveSSHManager()
      const req: AssembleMdArrayRequest = {
        name: body.name,
        uuid: body.uuid,
        members: node.members,
        targetName: body.targetName,
        confirmation: body.confirmation,
      }
      return await assembleMdArray(manager, req)
    },
    applySuccess: (node, result) => {
      node.stdout = result.stdout
      node.command = result.command
    },
  })

  return {
    ...body,
    mode: 'cluster',
    stdout: clusterResult.nodeResults.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
    command: clusterResult.nodeResults.map(n => `[${n.label}] ${n.command ?? ''}`).join('\n'),
    clusterExecution: clusterResult,
  }
}

export async function runClusterZeroMdSuperblocks(
  sanId: string,
  body: ZeroMdSuperblocksRequest,
): Promise<ZeroMdSuperblocksRequest & { mode: 'cluster'; ok: boolean; clusterExecution: ClusterMdExecutionResult }> {
  const clusterExecution = body.clusterExecution!
  if (body.mode === 'advanced') {
    throw createError({ statusCode: 400, statusMessage: 'Utilisez wipe-signatures pour le nettoyage avancé cluster' })
  }
  const expectedConfirm = expectedMdZeroMetadataConfirmation()
  if (body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const { nodeResults } = await buildZeroMdClusterExecutionPlan(body)
  const allResults: import('./raid-types').ZeroMdSuperblockPartitionResult[] = []
  const warnings: string[] = []

  const clusterResult = await executeClusterMdNodes({
    action: 'zero_md_superblocks',
    clusterExecution,
    nodeResults,
    nodesToRun: nodeResults,
    runOnNode: async (node) => {
      const manager = getActiveSSHManager()
      const overview = await collectRaidOverview(manager)
      const blockers = validateZeroSuperblockMembers(node.members, overview.blockDevices, overview.mdArrays)
      if (blockers.length > 0) throw createError({ statusCode: 400, statusMessage: blockers[0] })
      return await zeroMdSuperblocks(manager, node.members)
    },
    applySuccess: (node, result) => {
      node.stdout = result.stdout
      allResults.push(...result.results)
      warnings.push(...result.warnings)
    },
  })

  return {
    ...body,
    mode: 'cluster',
    ok: clusterResult.nodeResults.every(n => n.status === 'success'),
    results: allResults,
    warnings: [...new Set(warnings)],
    stdout: clusterResult.nodeResults.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
    commands: nodeResults.flatMap(n => (n.command ?? '').split('\n')).filter(Boolean),
    clusterExecution: clusterResult,
  }
}

export async function runClusterWipeMdSignatures(
  sanId: string,
  body: WipeMdSignaturesRequest,
): Promise<WipeMdSignaturesRequest & { mode: 'cluster'; ok: boolean; clusterExecution: ClusterMdExecutionResult }> {
  const clusterExecution = body.clusterExecution!
  const expectedConfirm = expectedMdAdvancedCleanupConfirmation()
  if (body.confirmation !== expectedConfirm) {
    throw createError({ statusCode: 400, statusMessage: `Confirmation invalide (attendu : "${expectedConfirm}")` })
  }

  const { nodeResults } = await buildWipeMdClusterExecutionPlan(body)
  const allResults: import('./raid-types').ZeroMdSuperblockPartitionResult[] = []
  const warnings: string[] = []

  const clusterResult = await executeClusterMdNodes({
    action: 'wipe_md_signatures',
    clusterExecution,
    nodeResults,
    nodesToRun: nodeResults,
    runOnNode: async (node) => {
      const manager = getActiveSSHManager()
      const overview = await collectRaidOverview(manager)
      const blockers = validateWipeSignatureMembers(node.members, overview.blockDevices, overview.mdArrays)
      if (blockers.length > 0) throw createError({ statusCode: 400, statusMessage: blockers[0] })
      return await wipeMdSignatures(
        manager,
        node.members,
        body.remainingSignatureTypes,
        body.detectionSourcesByMember,
      )
    },
    applySuccess: (node, result) => {
      node.stdout = result.stdout
      allResults.push(...result.results)
      warnings.push(...result.warnings)
    },
  })

  return {
    ...body,
    mode: 'cluster',
    ok: clusterResult.nodeResults.every(n => n.status === 'success'),
    results: allResults,
    warnings: [...new Set(warnings)],
    stdout: clusterResult.nodeResults.map(n => `[${n.label}]\n${n.stdout ?? ''}`).join('\n'),
    commands: nodeResults.flatMap(n => (n.command ?? '').split('\n')).filter(Boolean),
    clusterExecution: clusterResult,
  }
}

export function toClusterMdExecutionPlan(
  action: ClusterMdPreflightAction,
  sourceSanId: string,
  clusterId: string | undefined,
  nodeResults: ClusterMdNodeResult[],
): ClusterMdExecutionPlan {
  return {
    mode: nodeResults.length > 1 ? 'cluster' : 'standalone',
    action,
    sourceSanId,
    clusterId,
    nodeResults,
  }
}
