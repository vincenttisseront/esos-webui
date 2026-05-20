/**
 * Local-node-only MD recovery for clustered SANs (mapping ambiguity / degraded cluster).
 */
import { createError } from 'h3'
import { getSanSummary } from '../db/repositories/san.repository'
import type {
  ClusterMdPreflightAction,
  ClusterStoragePreflightResult,
  MdLocalRecoveryOffered,
  MdLocalRecoveryRequest,
} from './raid-types'

const MAPPING_BLOCKER_RE = /mapping ambigu|mapping incomplet|mapping manquant|mapping invalide|aucun équivalent/i
const SYNC_LIMITATION_RE = /Sync config/i

export function sanitizeNodeLabel(label: string): string {
  const trimmed = label.trim().replace(/\s+/g, ' ')
  if (!trimmed) {
    throw createError({ statusCode: 400, statusMessage: 'Libellé de nœud invalide pour la confirmation' })
  }
  return trimmed
}

export function expectedLocalCleanupConfirmation(nodeLabel: string): string {
  return `CLEAN LOCAL NODE ${sanitizeNodeLabel(nodeLabel)}`
}

export function expectedLocalStopConfirmation(nodeLabel: string): string {
  return `STOP LOCAL NODE ${sanitizeNodeLabel(nodeLabel)}`
}

export function expectedLocalAssembleConfirmation(nodeLabel: string): string {
  return `ASSEMBLE LOCAL NODE ${sanitizeNodeLabel(nodeLabel)}`
}

export function expectedLocalRecoveryConfirmation(
  action: ClusterMdPreflightAction | 'zero_md_superblocks' | 'wipe_md_signatures',
  nodeLabel: string,
): string {
  if (action === 'stop_md') return expectedLocalStopConfirmation(nodeLabel)
  if (action === 'assemble_md') return expectedLocalAssembleConfirmation(nodeLabel)
  return expectedLocalCleanupConfirmation(nodeLabel)
}

export function assertMutualExclusiveClusterAndLocal(
  clusterExecution: unknown,
  localRecovery: MdLocalRecoveryRequest | undefined,
): void {
  if (clusterExecution && localRecovery?.scope === 'local') {
    throw createError({
      statusCode: 400,
      statusMessage: 'clusterExecution et localRecovery sont mutuellement exclusifs',
    })
  }
}

export function assertLocalRecoveryShape(localRecovery: MdLocalRecoveryRequest | undefined): asserts localRecovery is MdLocalRecoveryRequest {
  if (!localRecovery || localRecovery.scope !== 'local') {
    throw createError({ statusCode: 400, statusMessage: 'localRecovery.scope="local" requis' })
  }
  if (!localRecovery.sanId?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'localRecovery.sanId requis' })
  }
  if (!Array.isArray(localRecovery.members) || localRecovery.members.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'localRecovery.members requis' })
  }
  if (!localRecovery.confirmation?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'localRecovery.confirmation requis' })
  }
}

export function assertLocalRecoverySanMatchesQuery(querySanId: string, localRecovery: MdLocalRecoveryRequest): void {
  if (localRecovery.sanId !== querySanId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'localRecovery.sanId doit correspondre au SAN courant',
    })
  }
}

export function assertMembersMatchLocalPayload(
  localMembers: string[],
  requestMembers: string[],
): void {
  const a = [...localMembers].map(String).sort()
  const b = [...requestMembers].map(String).sort()
  if (a.length !== b.length || a.some((m, i) => m !== b[i])) {
    throw createError({
      statusCode: 400,
      statusMessage: 'localRecovery.members doit correspondre aux members de la requête',
    })
  }
}

export function assertLocalRecoveryConfirmation(
  localRecovery: MdLocalRecoveryRequest,
  expectedPhrase: string,
): void {
  if (localRecovery.confirmation !== expectedPhrase) {
    throw createError({
      statusCode: 400,
      statusMessage: `Confirmation recovery locale invalide (attendu : "${expectedPhrase}")`,
    })
  }
}

export function isMappingAmbiguityClusterBlock(preflight: ClusterStoragePreflightResult): boolean {
  if (preflight.ok) return false

  const hardNonMapping = preflight.blockers.filter(b =>
    !MAPPING_BLOCKER_RE.test(b) && !SYNC_LIMITATION_RE.test(b),
  )
  if (hardNonMapping.length > 0) return false

  return preflight.blockers.some(b => MAPPING_BLOCKER_RE.test(b))
    || preflight.mappings.some(m => m.confidence === 'none' && (m.candidates?.length ?? 0) > 0)
}

export function buildLocalRecoveryOffered(
  preflight: ClusterStoragePreflightResult,
): MdLocalRecoveryOffered | undefined {
  if (!isMappingAmbiguityClusterBlock(preflight)) return undefined

  const primary = preflight.nodes.find(n => n.sanId === preflight.sourceSanId)
  const primaryLabel = primary?.label ?? preflight.sourceSanId

  const skippedPeers = preflight.nodes
    .filter(n => n.sanId !== preflight.sourceSanId)
    .map((peer) => {
      const reasons: string[] = []
      if (!peer.sshReady) {
        reasons.push(peer.error ? `SSH : ${peer.error}` : 'SSH non connecté')
      }
      const peerMappingBlockers = preflight.mappings
        .filter(m => m.targetSanId === peer.sanId)
        .flatMap(m => m.blockers)
      if (peerMappingBlockers.length) reasons.push(...peerMappingBlockers)
      const prefixed = preflight.blockers.filter(b => b.startsWith(`${peer.label} :`))
      for (const b of prefixed) {
        if (MAPPING_BLOCKER_RE.test(b)) reasons.push(b.replace(`${peer.label} : `, ''))
      }
      if (reasons.length === 0) reasons.push('Ignoré en mode recovery locale')
      return { sanId: peer.sanId, label: peer.label, reasons: [...new Set(reasons)] }
    })

  return {
    allowed: true,
    reason: 'mapping_ambiguous',
    primarySanId: preflight.sourceSanId,
    primaryLabel,
    skippedPeers,
  }
}

export function logLocalRecoveryExecution(input: {
  action: string
  sanId: string
  label: string
  members: string[]
  reason?: string
  clusterId?: string | null
}): void {
  console.warn('[raid-md:local-recovery]', {
    action: input.action,
    sanId: input.sanId,
    label: input.label,
    members: input.members,
    reason: input.reason ?? 'mapping_ambiguous',
    clusterId: input.clusterId ?? null,
    operatorConfirmationMatched: true,
  })
}

export function getSanLabelForLocalRecovery(sanId: string): string {
  return getSanSummary(sanId)?.label ?? sanId
}

function assertPeerSuperblockCreateRecovery(querySanId: string, localRecovery: MdLocalRecoveryRequest): void {
  if (localRecovery.reason !== 'peer_superblock_blocks_create') return
  const san = getSanSummary(querySanId)
  if (!san?.clusterId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Recovery superblock pair réservée aux SAN clusterisés',
    })
  }
}

export function validateLocalRecoveryForCleanup(input: {
  querySanId: string
  action: 'zero_md_superblocks' | 'wipe_md_signatures'
  localRecovery: MdLocalRecoveryRequest
  requestMembers: string[]
  clusterExecution?: unknown
  preflight?: ClusterStoragePreflightResult
}): string {
  assertMutualExclusiveClusterAndLocal(input.clusterExecution, input.localRecovery)
  assertLocalRecoveryShape(input.localRecovery)
  assertLocalRecoverySanMatchesQuery(input.querySanId, input.localRecovery)
  assertMembersMatchLocalPayload(input.localRecovery.members, input.requestMembers)
  assertPeerSuperblockCreateRecovery(input.querySanId, input.localRecovery)

  if (input.localRecovery.reason === 'peer_superblock_blocks_create') {
    const label = getSanLabelForLocalRecovery(input.querySanId)
    const expected = expectedLocalRecoveryConfirmation(input.action, label)
    assertLocalRecoveryConfirmation(input.localRecovery, expected)
    return expected
  }

  if (input.preflight) {
    if (isMappingAmbiguityClusterBlock(input.preflight)) {
      // allowed — cluster blocked only by mapping
    } else if (input.preflight.ok) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Recovery locale inutile : le préflight cluster est déjà validé',
      })
    } else {
      const nodePreflight = input.preflight.perNodePreflights[input.querySanId]
      if (nodePreflight && !nodePreflight.ok) {
        throw createError({
          statusCode: 409,
          statusMessage: `Préflight nœud local bloquant : ${nodePreflight.blockers.join('; ')}`,
        })
      }
      throw createError({
        statusCode: 409,
        statusMessage: `Recovery locale non autorisée : ${input.preflight.blockers.join('; ')}`,
      })
    }
  }

  const label = getSanLabelForLocalRecovery(input.querySanId)
  const expected = expectedLocalRecoveryConfirmation(input.action, label)
  assertLocalRecoveryConfirmation(input.localRecovery, expected)
  return expected
}
