import type { ClusterLvmNodeInventory, LvmCandidateDevice, LvmNodeSnapshot } from '~/types/lvm'
import type { LocalSymmetricLvmIssue } from '~/types/lvm'
import { assessLocalSymmetricLvm } from '~/utils/lvm-cluster-symmetry'

const MD_PATH_RE = /^\/dev\/md[a-z0-9_-]{0,15}$/i

/** Paths eligible for cluster PV create on all connected peers. */
export function filterClusterEligibleCandidates(
  primarySanId: string,
  candidates: LvmCandidateDevice[],
  inventory: ClusterLvmNodeInventory[] | null,
): Array<LvmCandidateDevice & { clusterBlockReason?: string }> {
  if (!inventory?.length) {
    return candidates.map(c => ({ ...c, clusterBlockReason: c.eligible ? undefined : c.reasons[0] }))
  }
  const primary = inventory.find(n => n.sanId === primarySanId)
  const peers = inventory.filter(n => n.sanId !== primarySanId)
  if (!primary) return []

  return candidates.map((c) => {
    if (!c.eligible) return { ...c, clusterBlockReason: c.reasons[0] }
    for (const peer of peers) {
      if (!peer.sshReady) {
        return { ...c, clusterBlockReason: `${peer.label} : SSH non connecté` }
      }
      if (MD_PATH_RE.test(c.path)) {
        const name = c.path.replace(/^\/dev\//, '')
        const peerMd = peer.mdArrays?.find(a => a.name === name)
        if (!peerMd) {
          return { ...c, clusterBlockReason: `${name} absent sur ${peer.label}` }
        }
        const peerCand = peer.overview.candidates.find(x => x.path === c.path)
        if (peerCand && !peerCand.eligible) {
          return { ...c, clusterBlockReason: `${c.path} non éligible sur ${peer.label}` }
        }
      } else {
        const peerCand = peer.overview.candidates.find(x => x.path === c.path && x.eligible)
        if (!peerCand) {
          return { ...c, clusterBlockReason: `${c.path} absent ou non éligible sur ${peer.label}` }
        }
      }
    }
    return { ...c }
  })
}

export function listClusterEligiblePaths(
  primarySanId: string,
  candidates: LvmCandidateDevice[],
  inventory: ClusterLvmNodeInventory[] | null,
): LvmCandidateDevice[] {
  return filterClusterEligibleCandidates(primarySanId, candidates, inventory)
    .filter(c => c.eligible && !(c as { clusterBlockReason?: string }).clusterBlockReason)
}

export function symmetryIssuesForOverview(
  local: { pvs: { path: string; vgName: string }[]; vgs: import('~/types/lvm').VolumeGroup[]; lvs: import('~/types/lvm').LogicalVolume[] },
  peers: LvmNodeSnapshot[],
): LocalSymmetricLvmIssue[] {
  return assessLocalSymmetricLvm(local, peers)
}

export function minVgFreeBytesAcrossCluster(
  vgName: string,
  primarySanId: string,
  localFree: number,
  inventory: ClusterLvmNodeInventory[] | null,
): number {
  if (!inventory?.length) return localFree
  let min = localFree
  for (const node of inventory) {
    const vg = node.overview.vgs.find(v => v.name === vgName && !v.clustered)
    if (vg) min = Math.min(min, vg.freeBytes)
    else if (node.sanId !== primarySanId) min = 0
  }
  return min
}
