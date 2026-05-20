import { describe, expect, it } from 'vitest'
import type { LvmOverviewResponse } from '~/types/lvm'
import { buildLvmRaidSummary } from '../utils/lvm-overview-summary'

function overview(partial: Partial<LvmOverviewResponse>): LvmOverviewResponse {
  return {
    scannedAt: 0,
    tools: {
      pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
      vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
    },
    pvs: [],
    vgs: [],
    lvs: [],
    candidates: [],
    alerts: [],
    ...partial,
  }
}

describe('buildLvmRaidSummary action-oriented', () => {
  it('orphan-free PV suggests create VG', () => {
    const summary = buildLvmRaidSummary(
      overview({
        pvs: [{ path: '/dev/md0', vgName: '', sizeBytes: 1, freeBytes: 1, uuid: 'u', usedBy: [] }],
      }),
      null,
    )
    expect(summary.stateKey).toBe('lvm.overview.raid_summary.state_incomplete')
    expect(summary.detailKey).toBe('lvm.overview.raid_summary.detail_free_pv')
    expect(summary.detailParams?.path).toBe('/dev/md0')
    expect(summary.nextStepKey).toBe('lvm.overview.raid_summary.next_create_vg')
    expect(summary.primaryAction).toBe('create_vg')
    expect(summary.issueMessages.some(m => /orphan/i.test(m))).toBe(false)
  })

  it('no PV suggests create PV', () => {
    const summary = buildLvmRaidSummary(
      overview({
        candidates: [{
          path: '/dev/md0', kind: 'md', sizeBytes: 1, eligible: true, reasons: [], usedBy: [], signatures: [],
        }],
      }),
      null,
    )
    expect(summary.nextStepKey).toBe('lvm.overview.raid_summary.next_create_pv')
    expect(summary.primaryActionLabelKey).toBe('lvm.overview.raid_summary.action_create_pv')
  })

  it('complete chain shows complete state', () => {
    const summary = buildLvmRaidSummary(
      overview({
        pvs: [{ path: '/dev/md0', vgName: 'data', sizeBytes: 1, freeBytes: 0, uuid: 'u', usedBy: [] }],
        vgs: [{ name: 'data', uuid: 'u', sizeBytes: 1, freeBytes: 0, pvCount: 1, lvCount: 1, clustered: false }],
        lvs: [{
          name: 'lvol0', path: '/dev/data/lvol0', vgName: 'data', sizeBytes: 1, uuid: 'u', active: true, usedBy: ['scst'],
          scstDeviceNames: ['lun0'],
        }],
      }),
      null,
    )
    expect(summary.stateKey).toBe('lvm.overview.raid_summary.state_complete')
    expect(summary.nextStepKey).toBe('lvm.overview.raid_summary.next_complete')
  })
})
