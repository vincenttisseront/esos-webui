/**
 * Cross-node MD + LVM symmetry for local-symmetric clusters.
 * LVM on /dev/mdN is expected on each node; UUIDs may differ.
 */

export interface MdArrayLvmNodeState {
  sanId: string
  label: string
  arrayName: string
  arrayPath: string
  mdActive: boolean
  hasLvm: boolean
  vgNames: string[]
}

export interface MdLvmSymmetryIssue {
  severity: 'warning' | 'critical'
  message: string
}

const LVM_USAGE_BLOCKER_RE = /est utilisé par LVM/i

export function isMdLvmUsageBlocker(message: string): boolean {
  return LVM_USAGE_BLOCKER_RE.test(message)
}

export function vgNamesOnMdPath(
  pvs: Array<{ path: string; vgName: string }>,
  arrayPath: string,
): string[] {
  const path = arrayPath.startsWith('/dev/') ? arrayPath : `/dev/${arrayPath}`
  const names = pvs
    .filter(p => p.path === path || p.path === arrayPath)
    .map(p => p.vgName.trim())
    .filter(Boolean)
  return [...new Set(names)]
}

export function collectMdArrayLvmStates(
  nodes: Array<{
    sanId: string
    label: string
    mdArrays: Array<{ name: string; path: string; usedBy?: string[] }>
    pvs: Array<{ path: string; vgName: string }>
  }>,
  arrayName: string,
): MdArrayLvmNodeState[] {
  const path = `/dev/${arrayName}`
  return nodes.map((node) => {
    const arr = node.mdArrays.find(a => a.name === arrayName || a.path === path)
    const vgNames = vgNamesOnMdPath(node.pvs, arr?.path ?? path)
    const hasLvm = !!(arr?.usedBy?.includes('lvm') || vgNames.length)
    return {
      sanId: node.sanId,
      label: node.label,
      arrayName,
      arrayPath: arr?.path ?? path,
      mdActive: !!arr,
      hasLvm,
      vgNames,
    }
  })
}

function sameVgNameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const n of sa) if (!sb.has(n)) return false
  return true
}

/** Compare LVM layout on a given MD array across cluster nodes. */
export function assessMdLvmClusterSymmetry(states: MdArrayLvmNodeState[]): MdLvmSymmetryIssue[] {
  const issues: MdLvmSymmetryIssue[] = []
  const reachable = states.filter(s => s.mdActive)
  if (reachable.length < 2) return issues

  const withLvm = reachable.filter(s => s.hasLvm)
  const withoutLvm = reachable.filter(s => !s.hasLvm)

  if (withLvm.length && withoutLvm.length) {
    for (const n of withoutLvm) {
      issues.push({
        severity: 'critical',
        message: `${n.arrayPath} : pas de LVM sur ${n.label} — complétez le provisionnement LVM sur ce nœud`,
      })
    }
    for (const n of withLvm) {
      issues.push({
        severity: 'warning',
        message: `${n.arrayPath} utilisé par LVM sur ${n.label} (${n.vgNames.join(', ') || 'VG inconnu'})`,
      })
    }
    return issues
  }

  if (withLvm.length < 2) return issues

  const reference = withLvm[0]!
  for (const peer of withLvm.slice(1)) {
    if (!sameVgNameSet(reference.vgNames, peer.vgNames)) {
      issues.push({
        severity: 'warning',
        message: `${reference.arrayPath} : VG différents (${reference.label}: ${reference.vgNames.join(', ') || '—'} vs ${peer.label}: ${peer.vgNames.join(', ') || '—'})`,
      })
    }
  }

  return issues
}

/**
 * Drop stop-preflight hard blockers that only reflect symmetric local LVM on MD
 * (not cluster asymmetry).
 */
export function filterMdClusterAsymmetryHardBlockers(
  hardBlockers: string[],
  lvmIssues: MdLvmSymmetryIssue[],
): string[] {
  if (!hardBlockers.length) return hardBlockers
  const nonLvm = hardBlockers.filter(b => !isMdLvmUsageBlocker(b))
  if (nonLvm.length) return hardBlockers
  const hasCriticalLvmAsymmetry = lvmIssues.some(i => i.severity === 'critical')
  if (!hasCriticalLvmAsymmetry) return []
  return hardBlockers
}
