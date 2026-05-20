import type { LvmNodeSnapshot, VolumeGroup } from '~/types/lvm'

export interface LvmStructuralIssue {
  vgName: string
  message: string
  severity: 'warning' | 'critical'
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
