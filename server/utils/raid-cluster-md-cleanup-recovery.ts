/**
 * Cluster degraded recovery for MD metadata cleanup (zero superblocks / wipe signatures).
 */
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { expectedMdAdvancedCleanupConfirmation, expectedMdZeroMetadataConfirmation } from './raid-md-actions'
import type {
  ClusterDiskMapping,
  ClusterMdNodeResult,
  ClusterMdPreflightAction,
  ClusterMdRecoveryAssessment,
  ClusterMdRecoveryMode,
  ClusterStorageNodeInventory,
  ClusterStoragePreflightResult,
  RaidPreflightResult,
} from './raid-types'

export const CLEANUP_REACHABLE_CONFIRMATION = 'CLEAN REACHABLE NODES'

export type CleanupSkipReasonKey =
  | 'unreachable'
  | 'mapping_missing'
  | 'mapping_ambiguous'
  | 'no_metadata'
  | 'node_preflight_blocked'

export function humanCleanupSkipReason(reason: CleanupSkipReasonKey, locale: 'fr' | 'en' = 'fr'): string {
  const fr: Record<CleanupSkipReasonKey, string> = {
    unreachable: 'Ignoré — SSH indisponible',
    mapping_missing: 'Mapping partition manquant ou incomplet',
    mapping_ambiguous: 'Mapping partition ambigu — sélection manuelle requise',
    no_metadata: 'Aucune métadonnée MD éligible sur les partitions mappées',
    node_preflight_blocked: 'Préflight nœud bloquant',
  }
  const en: Record<CleanupSkipReasonKey, string> = {
    unreachable: 'Skipped — SSH unavailable',
    mapping_missing: 'Missing or incomplete partition mapping',
    mapping_ambiguous: 'Ambiguous partition mapping — manual selection required',
    no_metadata: 'No eligible MD metadata on mapped partitions',
    node_preflight_blocked: 'Node preflight blocking',
  }
  return (locale === 'en' ? en : fr)[reason]
}

export function isCleanupClusterAction(
  action: ClusterMdPreflightAction,
): action is 'zero_md_superblocks' | 'wipe_md_signatures' {
  return action === 'zero_md_superblocks' || action === 'wipe_md_signatures'
}

export function expectedClusterCleanupConfirmation(
  recoveryMode: ClusterMdRecoveryMode | null | undefined,
): string {
  if (recoveryMode === 'cleanup_mapped_only') {
    return CLEANUP_REACHABLE_CONFIRMATION
  }
  return expectedMdZeroMetadataConfirmation()
}

export function expectedClusterWipeCleanupConfirmation(
  recoveryMode: ClusterMdRecoveryMode | null | undefined,
): string {
  if (recoveryMode === 'cleanup_mapped_only') {
    return CLEANUP_REACHABLE_CONFIRMATION
  }
  return expectedMdAdvancedCleanupConfirmation()
}

export function isCleanupSymmetricExecution(recoveryMode: ClusterMdRecoveryMode | null | undefined): boolean {
  return recoveryMode !== 'cleanup_mapped_only'
}

function orderNodes(
  nodes: ClusterStorageNodeInventory[],
  primarySanId: string,
): ClusterStorageNodeInventory[] {
  return [
    ...nodes.filter(n => n.sanId === primarySanId),
    ...nodes.filter(n => n.sanId !== primarySanId),
  ]
}

function resolveMembersForNode(
  node: ClusterStorageNodeInventory,
  primarySanId: string,
  sourceMembers: string[],
  mappings: ClusterDiskMapping[],
): { members: string[], mappingIssue?: CleanupSkipReasonKey } {
  if (node.sanId === primarySanId) {
    return { members: sourceMembers }
  }

  const members: string[] = []
  let mappingIssue: CleanupSkipReasonKey | undefined

  for (const sourcePath of sourceMembers) {
    const mapping = mappings.find(m => m.sourcePath === sourcePath && m.targetSanId === node.sanId)
    if (!mapping?.targetPath) {
      if (mapping?.confidence === 'none' && (mapping.candidates?.length ?? 0) > 0) {
        mappingIssue = mappingIssue ?? 'mapping_ambiguous'
      } else {
        mappingIssue = mappingIssue ?? 'mapping_missing'
      }
      continue
    }
    members.push(mapping.targetPath)
  }

  if (members.length < sourceMembers.length) {
    mappingIssue = mappingIssue ?? 'mapping_missing'
  }

  return { members, mappingIssue }
}

function isNoMetadataBlocker(blocker: string): boolean {
  return /superblock|métadonnée|metadata|aucun.*md/i.test(blocker)
}

function isActiveMdOnMemberBlocker(blocker: string): boolean {
  return /actif|active|monté|mounted/i.test(blocker)
}

function classifyNodePreflight(
  nodePreflight: RaidPreflightResult | undefined,
): { blocked: boolean, skip?: CleanupSkipReasonKey, error?: string } {
  if (!nodePreflight) {
    return { blocked: true, skip: 'mapping_missing', error: humanCleanupSkipReason('mapping_missing') }
  }
  if (nodePreflight.ok) {
    return { blocked: false }
  }
  const blockers = nodePreflight.blockers
  if (blockers.every(isNoMetadataBlocker)) {
    return { blocked: false, skip: 'no_metadata', error: humanCleanupSkipReason('no_metadata') }
  }
  if (blockers.some(isActiveMdOnMemberBlocker)) {
    return {
      blocked: true,
      error: blockers.filter(isActiveMdOnMemberBlocker).join('; ') || humanCleanupSkipReason('node_preflight_blocked'),
    }
  }
  return {
    blocked: true,
    error: blockers.join('; ') || humanCleanupSkipReason('node_preflight_blocked'),
  }
}

export function buildCleanupNodeResults(input: {
  preflight: ClusterStoragePreflightResult
  primarySanId: string
  sourceMembers: string[]
  action: 'zero_md_superblocks' | 'wipe_md_signatures'
  commandBuilder: (members: string[]) => string
}): ClusterMdNodeResult[] {
  const { preflight, primarySanId, sourceMembers, commandBuilder } = input
  const results: ClusterMdNodeResult[] = []

  for (const node of orderNodes(preflight.nodes, primarySanId)) {
    const base = {
      sanId: node.sanId,
      label: node.label,
      role: node.role,
      source: (node.sanId === primarySanId ? 'primary' : 'peer') as 'primary' | 'peer',
      members: [] as string[],
      devices: [] as string[],
    }

    if (!node.sshReady) {
      results.push({
        ...base,
        participation: 'skip',
        status: 'skipped',
        skipReason: humanCleanupSkipReason('unreachable'),
      })
      continue
    }

    const { members, mappingIssue } = resolveMembersForNode(
      node,
      primarySanId,
      sourceMembers,
      preflight.mappings,
    )

    if (mappingIssue || members.length === 0 || members.some(m => !m)) {
      const reason = mappingIssue ?? 'mapping_missing'
      results.push({
        ...base,
        participation: 'skip',
        status: 'skipped',
        skipReason: humanCleanupSkipReason(reason),
      })
      continue
    }

    const activeOnMember = node.mdArrays.some(arr =>
      arr.members.some(m => members.includes(m.path)),
    )
    if (activeOnMember) {
      results.push({
        ...base,
        members,
        devices: members,
        participation: 'blocked',
        status: 'pending',
        error: 'Tableau MD encore actif sur un membre — arrêtez le tableau avant le nettoyage',
      })
      continue
    }

    const nodePreflight = preflight.perNodePreflights[node.sanId]
    const pfClass = classifyNodePreflight(nodePreflight)
    if (pfClass.skip) {
      results.push({
        ...base,
        members,
        devices: members,
        participation: 'skip',
        status: 'skipped',
        skipReason: pfClass.error ?? humanCleanupSkipReason(pfClass.skip),
      })
      continue
    }
    if (pfClass.blocked) {
      results.push({
        ...base,
        members,
        devices: members,
        participation: 'blocked',
        status: 'pending',
        error: pfClass.error ?? humanCleanupSkipReason('node_preflight_blocked'),
      })
      continue
    }

    results.push({
      ...base,
      members,
      devices: members,
      participation: 'execute',
      status: 'pending',
      command: commandBuilder(members),
    })
  }

  return results
}

export function buildCleanupRecoveryAssessment(input: {
  action: ClusterMdPreflightAction
  arrayName?: string
  primarySanId: string
  sourceMembers: string[]
  nodes: ClusterStorageNodeInventory[]
  mappings: ClusterDiskMapping[]
  perNodePreflights: Record<string, RaidPreflightResult>
}): ClusterMdRecoveryAssessment {
  const commandBuilder = (members: string[]) =>
    input.action === 'wipe_md_signatures'
      ? members.map(m => `wipefs -a ${m}; mdadm --zero-superblock --force ${m}`).join('\n')
      : members.map(m => `mdadm --zero-superblock ${m}`).join('\n')

  const preflightStub: ClusterStoragePreflightResult = {
    ok: false,
    okSymmetric: false,
    okDegraded: false,
    action: input.action,
    sourceSanId: input.primarySanId,
    blockers: [],
    warnings: [],
    syncLimitations: [],
    nodes: input.nodes,
    mappings: input.mappings,
    perNodePreflights: input.perNodePreflights,
    executionModesAllowed: [],
  }

  const nodeResults = buildCleanupNodeResults({
    preflight: preflightStub,
    primarySanId: input.primarySanId,
    sourceMembers: input.sourceMembers,
    action: input.action as 'zero_md_superblocks' | 'wipe_md_signatures',
    commandBuilder,
  })

  const executeCount = nodeResults.filter(n => n.participation === 'execute').length
  const totalNodes = nodeResults.length
  const primaryResult = nodeResults.find(n => n.sanId === input.primarySanId)
  const hardBlockers: string[] = []
  const warnings: string[] = []

  if (executeCount === 0) {
    hardBlockers.push('Aucun nœud nettoyable pour ce cluster')
    if (primaryResult?.participation === 'blocked') {
      hardBlockers.push(
        `${primaryResult.label} : ${primaryResult.error ?? 'nœud primaire bloqué'}`,
      )
    }
  } else if (executeCount < totalNodes) {
    warnings.push(
      `${totalNodes - executeCount} nœud(s) ignoré(s) — nettoyage limité aux nœuds joignables avec mapping valide`,
    )
  }

  const okSymmetric = executeCount === totalNodes && totalNodes > 0
  const okDegraded = executeCount > 0

  return {
    action: input.action,
    arrayName: input.arrayName ?? '',
    nodeReports: [],
    hardBlockers,
    warnings,
    allowedRecoveryModes: okSymmetric ? [] : (okDegraded ? ['cleanup_mapped_only'] : []),
    recommendedRecoveryMode: okSymmetric ? null : (okDegraded ? 'cleanup_mapped_only' : null),
    okSymmetric,
    okDegraded,
  }
}

export function computeCleanupMdPlanToken(input: {
  action: ClusterMdPreflightAction
  recoveryMode: ClusterMdRecoveryMode | null
  primarySanId: string
  nodeResults: ClusterMdNodeResult[]
}): string {
  const payload = JSON.stringify({
    action: input.action,
    recoveryMode: input.recoveryMode ?? 'symmetric',
    primarySanId: input.primarySanId,
    nodes: input.nodeResults.map(n => ({
      sanId: n.sanId,
      participation: n.participation,
      members: n.members,
    })),
  })
  return createHash('sha256').update(payload).digest('hex').slice(0, 16)
}

export function resolveCleanupRecoveryMode(
  assessment: ClusterMdRecoveryAssessment,
  requested?: ClusterMdRecoveryMode,
): ClusterMdRecoveryMode | null {
  if (assessment.okSymmetric) {
    return null
  }
  const mode = requested ?? assessment.recommendedRecoveryMode
  if (mode === 'cleanup_mapped_only' && assessment.allowedRecoveryModes.includes(mode)) {
    return mode
  }
  if (mode && mode !== 'cleanup_mapped_only') {
    throw createError({
      statusCode: 400,
      statusMessage: `recoveryMode ${mode} non autorisé pour le nettoyage cluster`,
    })
  }
  if (assessment.okDegraded && assessment.allowedRecoveryModes.includes('cleanup_mapped_only')) {
    return 'cleanup_mapped_only'
  }
  throw createError({
    statusCode: 400,
    statusMessage: 'Mode recovery nettoyage invalide',
  })
}
