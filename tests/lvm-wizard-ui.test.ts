import { describe, expect, it } from 'vitest'
import type { LvmCandidateDevice } from '~/types/lvm'
import {
  filterLocalPvCreateCandidates,
  pickDefaultPvCreatePath,
  toPvCreateDeviceOptions,
} from '../utils/lvm-wizard-ui'

function cand(path: string, eligible: boolean): LvmCandidateDevice {
  return {
    path,
    kind: 'md',
    sizeBytes: 1,
    eligible,
    reasons: eligible ? [] : ['blocked'],
    usedBy: [],
    signatures: [],
  }
}

describe('lvm-wizard-ui PV create filters', () => {
  it('filterLocalPvCreateCandidates keeps only eligible entries', () => {
    const list = [
      cand('/dev/md0', true),
      cand('/dev/sda', false),
      cand('/dev/sdb1', false),
    ]
    expect(filterLocalPvCreateCandidates(list).map(c => c.path)).toEqual(['/dev/md0'])
  })

  it('toPvCreateDeviceOptions omits disabled/ineligible labels', () => {
    const opts = toPvCreateDeviceOptions([cand('/dev/md0', true)])
    expect(opts).toEqual([{ value: '/dev/md0', label: '/dev/md0' }])
  })

  it('pickDefaultPvCreatePath returns first eligible or empty', () => {
    expect(pickDefaultPvCreatePath([cand('/dev/md0', true)])).toBe('/dev/md0')
    expect(pickDefaultPvCreatePath([])).toBe('')
  })
})
