import { describe, expect, it } from 'vitest'
import { CLUSTER_MD_ACTIONS } from '../server/utils/raid-cluster-storage-preflight'

// Re-export check: cluster preflight accepts MD lifecycle actions
describe('cluster storage actions', () => {
  it('includes stop_md and assemble_md in cluster MD actions', () => {
    expect(CLUSTER_MD_ACTIONS).toContain('stop_md')
    expect(CLUSTER_MD_ACTIONS).toContain('assemble_md')
    expect(CLUSTER_MD_ACTIONS).toContain('zero_md_superblocks')
    expect(CLUSTER_MD_ACTIONS).toContain('wipe_md_signatures')
  })
})
