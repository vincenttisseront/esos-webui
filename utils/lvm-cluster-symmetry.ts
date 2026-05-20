import type { LvmNodeSnapshot, LocalSymmetricLvmIssue, LogicalVolume, VolumeGroup } from '~/types/lvm'

export interface LvmStructuralIssue {
  vgName: string
  message: string
  severity: 'warning' | 'critical'
}

const SIZE_TOLERANCE_RATIO = 0.01
const SIZE_TOLERANCE_MIN_BYTES = 4 * 1024 * 1024

function sizeWithinTolerance(a: number, b: number): boolean {
  const diff = Math.abs(a - b)
  const max = Math.max(a, b, 1)
  return diff <= Math.max(SIZE_TOLERANCE_MIN_BYTES, max * SIZE_TOLERANCE_RATIO)
}

export function findLvmStructuralIssues(
  local: { vgs: VolumeGroup[]; pvs: { path: string; vgName: string }[] },
  peers: LvmNodeSnapshot[],
): LvmStructuralIssue[] {
  const issues: LvmStructuralIssue[] = []
  const localVgNames = new Set(local.vgs.map(v => v.name))

  for (const vg of local.vgs) {
    if (vg.clustered) {
      issues.push({
        vgName: vg.name,
        severity: 'critical',
        message: `VG ${vg.name} clusterisé (clvmd) — non géré par la WebUI`,
      })
    }
  }

  for (const peer of peers) {
    for (const vgName of localVgNames) {
      const localVg = local.vgs.find(v => v.name === vgName)
      const peerVg = peer.vgs.find(v => v.name === vgName)
      if (!peerVg) {
        issues.push({
          vgName,
          severity: 'warning',
          message: `VG ${vgName} présent localement, absent sur ${peer.nodeLabel}`,
        })
        continue
      }
      if (localVg && Math.abs(localVg.pvCount - peerVg.pvCount) > 0) {
        issues.push({
          vgName,
          severity: 'warning',
          message: `VG ${vgName} : nombre de PV différent (${localVg.pvCount} vs ${peerVg.pvCount} sur ${peer.nodeLabel})`,
        })
      }
      if (peerVg.clustered || localVg?.clustered) {
        issues.push({
          vgName,
          severity: 'critical',
          message: `VG ${vgName} clusterisé (clvmd) — non géré par la WebUI`,
        })
      }
    }
    for (const peerVg of peer.vgs) {
      if (!localVgNames.has(peerVg.name)) {
        issues.push({
          vgName: peerVg.name,
          severity: 'warning',
          message: `VG ${peerVg.name} sur ${peer.nodeLabel}, absent localement`,
        })
      }
    }
  }
  return issues
}

/** Warn when nodes do not share the same set of non-clvmd VG names. */
export function findCrossNodeVgNameMismatch(
  nodes: Array<{ nodeLabel: string; vgs: VolumeGroup[] }>,
): LvmStructuralIssue[] {
  const issues: LvmStructuralIssue[] = []
  const connected = nodes.filter(n => n.vgs.length >= 0)
  if (connected.length < 2) return issues

  const sets = connected.map(n => ({
    label: n.nodeLabel,
    names: new Set(n.vgs.filter(v => !v.clustered).map(v => v.name)),
  }))
  const union = new Set<string>()
  for (const s of sets) for (const name of s.names) union.add(name)

  for (const name of union) {
    const present = sets.filter(s => s.names.has(name))
    const absent = sets.filter(s => !s.names.has(name))
    if (present.length && absent.length) {
      for (const a of absent) {
        issues.push({
          vgName: name,
          severity: 'warning',
          message: `VG ${name} absent sur ${a.label}`,
        })
      }
    }
  }
  return issues
}

/** Warn when LV name sets differ for the same VG across nodes. */
export function findCrossNodeLvNameMismatch(
  nodes: Array<{ nodeLabel: string; lvs: LogicalVolume[] }>,
  vgName: string,
): LvmStructuralIssue[] {
  const issues: LvmStructuralIssue[] = []
  const sets = nodes.map(n => ({
    label: n.nodeLabel,
    names: new Set(n.lvs.filter(l => l.vgName === vgName).map(l => l.name)),
  }))
  const union = new Set<string>()
  for (const s of sets) for (const n of s.names) union.add(n)

  for (const lvName of union) {
    const absent = sets.filter(s => !s.names.has(lvName))
    if (absent.length && absent.length < sets.length) {
      for (const a of absent) {
        issues.push({
          vgName,
          severity: 'warning',
          message: `LV ${lvName} absent sur ${a.label}`,
        })
      }
    }
  }
  return issues
}

export function assessClusterSymmetricLvm(
  primary: { nodeLabel: string; pvs: { path: string; vgName: string }[]; vgs: VolumeGroup[]; lvs: LogicalVolume[] },
  peers: LvmNodeSnapshot[],
  allNodes?: Array<{ nodeLabel: string; vgs: VolumeGroup[]; lvs: LogicalVolume[] }>,
): LocalSymmetricLvmIssue[] {
  const issues = assessLocalSymmetricLvm(primary, peers)
  if (allNodes?.length) {
    for (const si of findCrossNodeVgNameMismatch(allNodes)) {
      issues.push({ vgName: si.vgName, message: si.message, severity: si.severity })
    }
    const vgNames = new Set<string>()
    for (const n of allNodes) {
      for (const v of n.vgs) if (!v.clustered) vgNames.add(v.name)
    }
    for (const vgName of vgNames) {
      for (const si of findCrossNodeLvNameMismatch(allNodes, vgName)) {
        issues.push({ vgName: si.vgName, message: si.message, severity: si.severity })
      }
    }
  }
  return issues
}

export function assessLocalSymmetricLvm(
  local: { pvs: { path: string; vgName: string }[]; vgs: VolumeGroup[]; lvs: LogicalVolume[] },
  peers: LvmNodeSnapshot[],
): LocalSymmetricLvmIssue[] {
  const issues: LocalSymmetricLvmIssue[] = []
  issues.push(...findLvmStructuralIssues(local, peers).map(i => ({
    vgName: i.vgName,
    message: i.message,
    severity: i.severity,
  })))

  for (const vg of local.vgs) {
    for (const peer of peers) {
      const peerVg = peer.vgs.find(v => v.name === vg.name)
      if (!peerVg) continue
      if (!sizeWithinTolerance(vg.freeBytes, peerVg.freeBytes)) {
        issues.push({
          vgName: vg.name,
          severity: 'warning',
          message: `Espace libre différent (${peer.nodeLabel})`,
        })
      }
      const localLvs = local.lvs.filter(lv => lv.vgName === vg.name)
      for (const lv of localLvs) {
        const peerLv = peer.lvs.find(l => l.vgName === vg.name && l.name === lv.name)
        if (!peerLv) {
          issues.push({
            vgName: vg.name,
            lvName: lv.name,
            severity: 'warning',
            message: `LV ${lv.name} absent sur ${peer.nodeLabel}`,
          })
          continue
        }
        if (!sizeWithinTolerance(lv.sizeBytes, peerLv.sizeBytes)) {
          issues.push({
            vgName: vg.name,
            lvName: lv.name,
            severity: 'warning',
            message: `Taille LV différente sur ${peer.nodeLabel}`,
          })
        }
      }
      for (const peerLv of peer.lvs.filter(l => l.vgName === vg.name)) {
        if (!localLvs.some(l => l.name === peerLv.name)) {
          issues.push({
            vgName: vg.name,
            lvName: peerLv.name,
            severity: 'warning',
            message: `LV ${peerLv.name} sur ${peer.nodeLabel}, absent localement`,
          })
        }
      }
    }
  }
  return issues
}
