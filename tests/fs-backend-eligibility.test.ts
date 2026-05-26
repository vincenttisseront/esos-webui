import { describe, expect, it } from 'vitest'
import {
  buildBackendEligibilityView,
  classifyBackendStatusGroup,
  groupFileioBackends,
} from '../utils/fs-backend-eligibility'
import { FS_BACKEND_REASON } from '../utils/fs-backend-reasons'
import type { FsBackendRef } from '../types/filesystem'

function backend(partial: Partial<FsBackendRef>): FsBackendRef {
  return {
    path: '/dev/x',
    kind: 'disk',
    source: 'disk',
    sizeBytes: 1e9,
    eligible: false,
    reasons: [],
    ...partial,
  }
}

describe('fs-backend-eligibility', () => {
  it('classifies SCST blockio as in_use with dedicated summary', () => {
    const b = backend({
      path: '/dev/mapper/data-photos',
      kind: 'lvm_lv',
      eligible: false,
      reasons: [FS_BACKEND_REASON.SCST_BLOCKIO],
    })
    expect(classifyBackendStatusGroup(b)).toBe('in_use')
    const view = buildBackendEligibilityView(b)
    expect(view.summaryKey).toBe('storage.fs.backend.summary.scst_blockio')
    expect(view.recommendationKey).toBe('storage.fs.backend.recommendation.scst_blockio')
  })

  it('classifies MD with LVM PV as ineligible with LVM recommendation', () => {
    const b = backend({
      path: '/dev/md0',
      kind: 'md',
      source: 'md',
      eligible: false,
      reasons: [
        FS_BACKEND_REASON.FILESYSTEM_SIGNATURE,
        FS_BACKEND_REASON.LVM_PV,
        FS_BACKEND_REASON.MD_MEMBER,
      ],
    })
    expect(classifyBackendStatusGroup(b)).toBe('ineligible')
    const view = buildBackendEligibilityView(b)
    expect(view.summaryKey).toBe('storage.fs.backend.summary.md_lvm_base')
    expect(view.recommendationKey).toBe('storage.fs.backend.recommendation.md_lvm_base')
  })

  it('normalizes legacy French reasons', () => {
    const b = backend({
      eligible: false,
      reasons: ['Utilisé par SCST (blockio)'],
    })
    expect(classifyBackendStatusGroup(b)).toBe('in_use')
  })

  it('groups backends by status', () => {
    const groups = groupFileioBackends([
      backend({ path: '/dev/a', eligible: true, reasons: [] }),
      backend({ path: '/dev/b', eligible: false, reasons: [FS_BACKEND_REASON.SCST] }),
      backend({ path: '/dev/c', eligible: false, reasons: [FS_BACKEND_REASON.LVM_PV] }),
    ])
    expect(groups.available).toHaveLength(1)
    expect(groups.in_use).toHaveLength(1)
    expect(groups.ineligible).toHaveLength(1)
  })
})
