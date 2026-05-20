import type { LvmOverviewResponse, LvmNodeSnapshot } from '~/types/lvm'
import { assessLocalSymmetricLvm } from '~/utils/lvm-cluster-symmetry'
import { computeLvmNextAction } from '~/utils/lvm-provisioning-chain'

export type LvmRaidSummaryStatus = 'ok' | 'attention' | 'empty' | 'unavailable' | 'incomplete'

export type LvmRaidPrimaryAction = 'open_tab' | 'create_pv' | 'create_vg' | 'create_lv' | 'bind_scst' | 'none'

export interface LvmRaidSummary {
  status: LvmRaidSummaryStatus
  statusKey: string
  stateKey: string
  pvCount: number
  vgCount: number
  lvCount: number
  freePvCount: number
  freePvPaths: string[]
  detailKey: string
  detailParams?: Record<string, string>
  nextStepKey: string
  nextStepParams?: Record<string, string>
  primaryAction: LvmRaidPrimaryAction
  primaryActionLabelKey: string
  countsLabelKey: string
  countsParams: { pv: number; vg: number; lv: number }
  issueMessages: string[]
}

function firstUnboundLv(overview: LvmOverviewResponse) {
  return overview.lvs.find(lv => !lv.scstDeviceNames?.length)
}

function buildActionSummary(
  overview: LvmOverviewResponse,
  clusterPeers: LvmNodeSnapshot[],
  isClustered: boolean,
): Pick<
  LvmRaidSummary,
  | 'stateKey'
  | 'detailKey'
  | 'detailParams'
  | 'nextStepKey'
  | 'nextStepParams'
  | 'primaryAction'
  | 'primaryActionLabelKey'
  | 'status'
  | 'statusKey'
> {
  const freePvs = overview.pvs.filter(p => !p.vgName)
  const freePvPaths = freePvs.map(p => p.path)
  const primaryPvPath = freePvs[0]?.path ?? overview.pvs[0]?.path

  const next = computeLvmNextAction({
    candidates: overview.candidates.filter(c => c.eligible),
    pvs: overview.pvs,
    vgs: overview.vgs,
    lvs: overview.lvs,
    orphanPvs: freePvs,
    symmetryIssues: isClustered && clusterPeers.length
      ? assessLocalSymmetricLvm(
          { pvs: overview.pvs, vgs: overview.vgs, lvs: overview.lvs },
          clusterPeers,
        ).filter(s => s.severity !== 'info')
      : [],
  })

  if (next.kind === 'complete') {
    return {
      status: 'ok',
      statusKey: 'lvm.overview.raid_summary.status_ok',
      stateKey: 'lvm.overview.raid_summary.state_complete',
      detailKey: 'lvm.overview.raid_summary.detail_provisioned',
      nextStepKey: 'lvm.overview.raid_summary.next_complete',
      primaryAction: 'open_tab',
      primaryActionLabelKey: 'lvm.overview.raid_summary.action_open_tab',
    }
  }

  const incomplete = {
    status: 'incomplete' as const,
    statusKey: 'lvm.overview.raid_summary.status_incomplete',
    stateKey: 'lvm.overview.raid_summary.state_incomplete',
  }

  switch (next.kind) {
    case 'create_pv':
      return {
        ...incomplete,
        detailKey: freePvPaths.length
          ? 'lvm.overview.raid_summary.detail_free_pv'
          : 'lvm.overview.raid_summary.detail_no_pv',
        detailParams: freePvPaths.length
          ? { path: primaryPvPath ?? '' }
          : undefined,
        nextStepKey: 'lvm.overview.raid_summary.next_create_pv',
        nextStepParams: next.messageParams,
        primaryAction: 'create_pv',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_create_pv',
      }
    case 'need_source':
      return {
        ...incomplete,
        detailKey: 'lvm.overview.raid_summary.detail_no_pv',
        nextStepKey: 'lvm.overview.raid_summary.next_create_pv',
        primaryAction: 'open_tab',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_open_tab',
      }
    case 'create_vg':
      return {
        ...incomplete,
        detailKey: 'lvm.overview.raid_summary.detail_free_pv',
        detailParams: { path: next.messageParams?.path ?? primaryPvPath ?? '' },
        nextStepKey: 'lvm.overview.raid_summary.next_create_vg',
        nextStepParams: next.messageParams,
        primaryAction: 'create_vg',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_create_vg',
      }
    case 'create_lv':
      return {
        ...incomplete,
        detailKey: overview.vgs[0]
          ? 'lvm.overview.raid_summary.detail_vg_ready'
          : 'lvm.overview.raid_summary.detail_no_vg',
        detailParams: overview.vgs[0] ? { vg: overview.vgs[0].name } : undefined,
        nextStepKey: 'lvm.overview.raid_summary.next_create_lv',
        nextStepParams: next.messageParams,
        primaryAction: 'create_lv',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_create_lv',
      }
    case 'bind_scst': {
      const lv = firstUnboundLv(overview)
      return {
        ...incomplete,
        detailKey: lv
          ? 'lvm.overview.raid_summary.detail_lv_ready'
          : 'lvm.overview.raid_summary.detail_no_lv',
        detailParams: lv ? { lvPath: lv.path } : undefined,
        nextStepKey: 'lvm.overview.raid_summary.next_bind_scst',
        nextStepParams: next.messageParams,
        primaryAction: 'bind_scst',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_bind_scst',
      }
    }
    case 'blocked':
    case 'readonly':
      return {
        status: 'attention',
        statusKey: 'lvm.overview.raid_summary.status_attention',
        stateKey: 'lvm.overview.raid_summary.state_incomplete',
        detailKey: freePvPaths.length
          ? 'lvm.overview.raid_summary.detail_free_pv'
          : overview.pvs.length
            ? 'lvm.overview.raid_summary.detail_pv_in_vg'
            : 'lvm.overview.raid_summary.detail_no_pv',
        detailParams: freePvPaths.length ? { path: freePvPaths[0] } : undefined,
        nextStepKey: next.kind === 'readonly'
          ? 'lvm.overview.raid_summary.next_readonly'
          : 'lvm.overview.raid_summary.next_blocked',
        nextStepParams: next.messageParams,
        primaryAction: 'open_tab',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_open_tab',
      }
    default:
      return {
        ...incomplete,
        detailKey: 'lvm.overview.raid_summary.detail_no_pv',
        nextStepKey: 'lvm.overview.raid_summary.next_create_pv',
        primaryAction: 'open_tab',
        primaryActionLabelKey: 'lvm.overview.raid_summary.action_open_tab',
      }
  }
}

export function buildLvmRaidSummary(
  overview: LvmOverviewResponse | null,
  loadError: string | null,
  clusterPeers: LvmNodeSnapshot[] = [],
  isClustered = false,
): LvmRaidSummary {
  const emptyCounts = { pv: 0, vg: 0, lv: 0 }

  if (loadError || !overview) {
    return {
      status: 'unavailable',
      statusKey: 'lvm.overview.raid_summary.status_unavailable',
      stateKey: 'lvm.overview.raid_summary.state_unavailable',
      pvCount: 0,
      vgCount: 0,
      lvCount: 0,
      freePvCount: 0,
      freePvPaths: [],
      detailKey: 'lvm.overview.raid_summary.detail_unavailable',
      nextStepKey: 'lvm.overview.raid_summary.next_unavailable',
      primaryAction: 'open_tab',
      primaryActionLabelKey: 'lvm.overview.raid_summary.action_open_tab',
      countsLabelKey: 'lvm.overview.raid_summary.counts',
      countsParams: emptyCounts,
      issueMessages: loadError ? [loadError] : [],
    }
  }

  const pvCount = overview.pvs.length
  const vgCount = overview.vgs.length
  const lvCount = overview.lvs.length
  const freePvs = overview.pvs.filter(p => !p.vgName)
  const freePvCount = freePvs.length
  const freePvPaths = freePvs.map(p => p.path)
  const issueMessages: string[] = []

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

  const countsParams = { pv: pvCount, vg: vgCount, lv: lvCount }

  if (pvCount === 0 && vgCount === 0 && lvCount === 0) {
    const action = buildActionSummary(overview, clusterPeers, isClustered)
    return {
      ...action,
      pvCount,
      vgCount,
      lvCount,
      freePvCount,
      freePvPaths,
      countsLabelKey: 'lvm.overview.raid_summary.counts',
      countsParams,
      issueMessages,
      status: 'empty',
      statusKey: 'lvm.overview.raid_summary.status_empty',
      stateKey: 'lvm.overview.raid_summary.state_incomplete',
    }
  }

  const action = buildActionSummary(overview, clusterPeers, isClustered)

  if (issueMessages.length && action.status !== 'ok') {
    return {
      ...action,
      status: 'attention',
      statusKey: 'lvm.overview.raid_summary.status_attention',
      pvCount,
      vgCount,
      lvCount,
      freePvCount,
      freePvPaths,
      countsLabelKey: 'lvm.overview.raid_summary.counts',
      countsParams,
      issueMessages,
    }
  }

  return {
    ...action,
    pvCount,
    vgCount,
    lvCount,
    freePvCount,
    freePvPaths,
    countsLabelKey: 'lvm.overview.raid_summary.counts',
    countsParams,
    issueMessages,
  }
}
