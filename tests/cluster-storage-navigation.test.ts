import { describe, expect, it } from 'vitest'
import {
  clusterStorageQuery,
  isClusterStorageScope,
} from '~/utils/cluster-storage-navigation'

describe('cluster-storage-navigation', () => {
  it('builds cluster storage query', () => {
    expect(clusterStorageQuery('cluster-1')).toEqual({
      scope: 'cluster',
      clusterId: 'cluster-1',
    })
  })

  it('parses cluster scope from route query', () => {
    expect(isClusterStorageScope({ scope: 'cluster', clusterId: 'abc' })).toEqual({
      clusterId: 'abc',
    })
    expect(isClusterStorageScope({ scope: 'san' })).toBeNull()
  })
})
