import { describe, expect, it } from 'vitest'
import {
  deriveClusterHealth,
  mergeClusterHealth,
  storageOverallToHealth,
} from '../server/utils/cluster-health'

describe('cluster-health', () => {
  it('merges attention and storage health', () => {
    expect(mergeClusterHealth('healthy', 'warning', true)).toBe('warning')
    expect(mergeClusterHealth('healthy', 'critical', true)).toBe('critical')
    expect(mergeClusterHealth('warning', 'healthy', true)).toBe('warning')
    expect(mergeClusterHealth('healthy', 'healthy', false)).toBe('unknown')
  })

  it('maps storage overall to health', () => {
    expect(storageOverallToHealth('ok')).toBe('healthy')
    expect(storageOverallToHealth('critical')).toBe('critical')
  })

  it('deriveClusterHealth matches attention severities', () => {
    expect(deriveClusterHealth([], true)).toBe('healthy')
    expect(deriveClusterHealth([{
      id: 'x',
      severity: 'critical',
      category: 'connectivity',
      title: 't',
      summary: 's',
      affectedNodeIds: [],
      affectedNodeLabels: [],
      recommendedAction: 'none',
      dismissible: false,
      source: 'cluster_status',
      detectedAt: 0,
    }], true)).toBe('critical')
  })
})
