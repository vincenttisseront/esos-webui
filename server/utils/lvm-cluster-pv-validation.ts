import type { ClusterLvmDiskMapping, ClusterLvmNodeInventory } from './lvm-types'

const SIZE_TOLERANCE_RATIO = 0.01
const SIZE_TOLERANCE_MIN_BYTES = 4 * 1024 * 1024

function sizeWithinTolerance(a?: number, b?: number): boolean {
  if (a == null || b == null) return true
  const diff = Math.abs(a - b)
  const max = Math.max(a, b, 1)
  return diff <= Math.max(SIZE_TOLERANCE_MIN_BYTES, max * SIZE_TOLERANCE_RATIO)
}

function resolveNodePvPath(
  node: ClusterLvmNodeInventory,
  primarySanId: string,
  sourcePath: string,
  mappings: ClusterLvmDiskMapping[],
): string | undefined {
  if (node.sanId === primarySanId) return sourcePath
  return mappings.find(m => m.sourcePath === sourcePath && m.peerSanId === node.sanId)?.peerPath
}

/** Cross-node pvcreate checks (complements per-node runLvmPreflight). */
export function validateClusterPvCreatePaths(
  primarySanId: string,
  sourcePath: string,
  nodes: ClusterLvmNodeInventory[],
  mappings: ClusterLvmDiskMapping[],
  force: boolean,
): string[] {
  const blockers: string[] = []
  const sizes: { label: string; bytes: number }[] = []

  for (const node of nodes) {
    if (!node.sshReady) {
      blockers.push(`${node.label} : SSH non connecté`)
      continue
    }
    const path = resolveNodePvPath(node, primarySanId, sourcePath, mappings)
    if (!path) {
      blockers.push(`${node.label} : chemin PV non mappé pour ${sourcePath}`)
      continue
    }

    const existingPv = node.overview.pvs.find(p => p.path === path)
    if (existingPv) {
      blockers.push(`${node.label} : PV déjà présent sur ${path}`)
      if (existingPv.vgName) {
        blockers.push(`${node.label} : ${path} appartient déjà au VG ${existingPv.vgName}`)
      }
    }

    const cand = node.overview.candidates.find(c => c.path === path)
    const md = node.mdArrays?.find(a => a.path === path || `/dev/${a.name}` === path)
    const blk = node.blockDevices?.find(d => d.path === path)
    if (!cand && !md && !blk) {
      blockers.push(`${node.label} : périphérique ${path} introuvable sur ce nœud`)
    }

    if (cand) {
      if (!cand.eligible && !force) {
        blockers.push(`${node.label} : ${path} non éligible — ${cand.reasons.join(', ') || 'voir Block Devices'}`)
      }
      if (cand.usedBy.includes('mounted') || cand.reasons.some(r => /monté/i.test(r))) {
        blockers.push(`${node.label} : ${path} est monté`)
      }
      if (cand.usedBy.includes('scst')) {
        blockers.push(`${node.label} : ${path} utilisé par SCST`)
      }
      if (cand.usedBy.includes('lvm') && !existingPv) {
        blockers.push(`${node.label} : ${path} signalé comme LVM`)
      }
      if (
        !force
        && (cand.usedBy.includes('filesystem') || cand.usedBy.includes('unknown_signature')
          || cand.reasons.some(r => /signature|fichiers/i.test(r)))
      ) {
        blockers.push(`${node.label} : signature ou système de fichiers sur ${path} (force requis)`)
      }
      if (cand.sizeBytes) sizes.push({ label: node.label, bytes: cand.sizeBytes })
    } else if (md?.sizeBytes) {
      sizes.push({ label: node.label, bytes: md.sizeBytes })
    } else if (blk?.sizeBytes) {
      sizes.push({ label: node.label, bytes: blk.sizeBytes })
    }

    if (!node.overview.tools.pvcreate) {
      blockers.push(`${node.label} : pvcreate indisponible`)
    }
  }

  if (sizes.length >= 2) {
    const ref = sizes[0]
    for (let i = 1; i < sizes.length; i++) {
      if (!sizeWithinTolerance(ref.bytes, sizes[i].bytes)) {
        blockers.push(
          `Tailles incohérentes entre nœuds (${ref.label} vs ${sizes[i].label})`,
        )
        break
      }
    }
  }

  return [...new Set(blockers)]
}
