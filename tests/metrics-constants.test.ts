import { describe, expect, it } from 'vitest'
import {
  defaultMetricsSanId,
  mountpointToVolumeSubject,
  resolveHistoryWindowMs,
} from '~/server/utils/metrics-constants'

describe('metrics-constants', () => {
  it('resolves history windows', () => {
    expect(resolveHistoryWindowMs('1h')).toBe(3_600_000)
    expect(resolveHistoryWindowMs('unknown')).toBe(3_600_000)
  })

  it('maps mountpoints to volume subjects', () => {
    expect(mountpointToVolumeSubject('/mnt/vdisks/fs01')).toBe('mnt_vdisks_fs01')
    expect(mountpointToVolumeSubject('/')).toBe('root')
  })

  it('uses default san id', () => {
    expect(defaultMetricsSanId()).toBeTruthy()
  })
})
