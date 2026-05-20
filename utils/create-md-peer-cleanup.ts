import type {
  ClusterStoragePreflightResult,
  MdLocalRecoveryRequest,
  PreflightBlockerRef,
} from '~/types/raid'
import { expectedLocalCleanupConfirmation } from '~/utils/raid-local-recovery-confirm'

export interface PeerSuperblockCleanupGroup {
  sanId: string
  label: string
  sshReady: boolean
  members: string[]
  blockerRefs: PreflightBlockerRef[]
}

export function expectedPeerCleanupConfirmation(peerLabel: string): string {
  return expectedLocalCleanupConfirmation(peerLabel)
}

export function resolvePeerCleanupMembers(input: {
  preflight: ClusterStoragePreflightResult
  peerSanId: string
  sourceDevices?: string[]
  blockerRefs?: PreflightBlockerRef[]
}): string[] {
  const refs = input.blockerRefs
    ?? (input.preflight.blockerRefs ?? []).filter(
      r => r.code === 'md_superblock_on_partition' && r.sanId === input.peerSanId,
    )

  const fromRefs = refs
    .map(r => r.path)
    .filter((path): path is string => Boolean(path))

  if (fromRefs.length > 0) {
    return [...new Set(fromRefs)].sort()
  }

  const paths: string[] = []
  for (const sourcePath of input.sourceDevices ?? []) {
    const mapping = input.preflight.mappings.find(
      m => m.sourcePath === sourcePath && m.targetSanId === input.peerSanId,
    )
    if (mapping?.targetPath) paths.push(mapping.targetPath)
  }
  return [...new Set(paths)].sort()
}

export function groupPeerSuperblockBlockers(
  preflight: ClusterStoragePreflightResult,
  primarySanId: string,
  sourceDevices: string[] = [],
): PeerSuperblockCleanupGroup[] {
  const refs = preflight.blockerRefs ?? []
  const byPeer = new Map<string, PreflightBlockerRef[]>()

  for (const ref of refs) {
    if (ref.code !== 'md_superblock_on_partition') continue
    if (!ref.sanId || ref.sanId === primarySanId) continue
    const list = byPeer.get(ref.sanId) ?? []
    list.push(ref)
    byPeer.set(ref.sanId, list)
  }

  const groups: PeerSuperblockCleanupGroup[] = []
  for (const [sanId, blockerRefs] of byPeer) {
    const node = preflight.nodes.find(n => n.sanId === sanId)
    const members = resolvePeerCleanupMembers({
      preflight,
      peerSanId: sanId,
      sourceDevices,
      blockerRefs,
    })
    if (members.length === 0) continue
    groups.push({
      sanId,
      label: node?.label ?? sanId,
      sshReady: node?.sshReady ?? false,
      members,
      blockerRefs,
    })
  }

  return groups.sort((a, b) => a.label.localeCompare(b.label))
}

export function buildPeerLocalRecoveryPayload(input: {
  peerSanId: string
  members: string[]
  confirmation: string
}): {
  members: string[]
  confirmation: string
  localRecovery: MdLocalRecoveryRequest
} {
  const confirmation = input.confirmation.trim()
  const members = [...input.members]
  return {
    members,
    confirmation,
    localRecovery: {
      scope: 'local',
      sanId: input.peerSanId,
      members,
      confirmation,
      reason: 'peer_superblock_blocks_create',
    },
  }
}
