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
