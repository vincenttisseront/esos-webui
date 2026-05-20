import type { LvmOverviewResponse, LvmNodeSnapshot } from '~/types/lvm'
import { assessLocalSymmetricLvm } from '~/utils/lvm-cluster-symmetry'

export type LvmRaidSummaryStatus = 'ok' | 'attention' | 'empty' | 'unavailable'

export interface LvmRaidSummary {
  status: LvmRaidSummaryStatus
  statusKey: string
  pvCount: number
  vgCount: number
  lvCount: number
  orphanPvCount: number
  issueMessages: string[]
}

export function buildLvmRaidSummary(
  overview: LvmOverviewResponse | null,
  loadError: string | null,
  clusterPeers: LvmNodeSnapshot[] = [],
  isClustered = false,
): LvmRaidSummary {
  if (loadError || !overview) {
    return {
      status: 'unavailable',
      statusKey: 'lvm.overview.raid_summary.status_unavailable',
      pvCount: 0,
      vgCount: 0,
      lvCount: 0,
      orphanPvCount: 0,
      issueMessages: loadError ? [loadError] : [],
    }
  }

  const pvCount = overview.pvs.length
  const vgCount = overview.vgs.length
  const lvCount = overview.lvs.length
  const orphanPvCount = overview.pvs.filter(p => !p.vgName).length
  const issueMessages: string[] = []

  if (orphanPvCount > 0) {
    issueMessages.push(`${orphanPvCount} orphan PV(s)`)
  }
  if (overview.vgs.some(v => v.clustered)) {
    issueMessages.push('clvmd VG detected')
  }

  if (isClustered && clusterPeers.length) {
    const symmetry = assessLocalSymmetricLvm(
      { pvs: overview.pvs, vgs: overview.vgs, lvs: overview.lvs },
      clusterPeers,
    )
    for (const issue of symmetry.filter(s => s.severity !== 'info')) {
      issueMessages.push(issue.message)
    }
  }

  if (pvCount === 0 && vgCount === 0 && lvCount === 0) {
    return {
      status: 'empty',
      statusKey: 'lvm.overview.raid_summary.status_empty',
      pvCount,
      vgCount,
      lvCount,
      orphanPvCount,
      issueMessages,
    }
  }

  if (issueMessages.length) {
    return {
      status: 'attention',
      statusKey: 'lvm.overview.raid_summary.status_attention',
      pvCount,
      vgCount,
      lvCount,
      orphanPvCount,
      issueMessages,
    }
  }

  return {
    status: 'ok',
    statusKey: 'lvm.overview.raid_summary.status_ok',
    pvCount,
    vgCount,
    lvCount,
    orphanPvCount,
    issueMessages,
  }
}
