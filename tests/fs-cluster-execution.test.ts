import { describe, expect, it } from 'vitest'
import { CLUSTER_FS_BLOCKED_MESSAGE } from '~/server/utils/fs-cluster-execution'

describe('fs-cluster-execution', () => {
  it('exports blocked message constant', () => {
    expect(CLUSTER_FS_BLOCKED_MESSAGE).toContain('cluster')
  })
})
