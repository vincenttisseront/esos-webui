import { describe, expect, it, vi, beforeEach } from 'vitest'
import { clearPlanTokens } from '../server/utils/alua-plan-token'
import { applyAluaClusterPlan, ALUA_CONFIRMATION_PHRASE } from '../server/utils/alua-cluster-apply'
import type { AluaClusterPlan } from '../types/alua'

const writeMock = vi.fn().mockResolvedValue(undefined)
const execMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 })

vi.mock('../server/utils/cluster-resolve', () => ({
  resolveClusterMembers: () => [
    { id: 'a', label: 'esos1', host: '10.0.0.1', readOnly: false, clusterRole: 'primary' },
    { id: 'b', label: 'esos2', host: '10.0.0.2', readOnly: false, clusterRole: 'secondary' },
  ],
}))

vi.mock('../server/utils/cluster-readonly', () => ({
  assertClusterNodesWritable: vi.fn(),
}))

vi.mock('../server/utils/ssh-pool', () => ({
  getSSHPool: () => ({
    get: (id: string) => ({
      getStatus: () => (id === 'b' ? 'disconnected' : 'connected'),
      exec: execMock,
    }),
  }),
}))

vi.mock('../server/utils/ssh-runtime', () => ({
  withSanContext: async (_id: string, fn: () => Promise<void>) => fn(),
}))

vi.mock('../server/utils/scst-config-writer', () => ({
  writeAndReloadScst: (...args: unknown[]) => writeMock(...args),
}))

const minimalPlan: AluaClusterPlan = {
  clusterId:     'c1',
  primaryNodeId: 'a',
  peerNodeId:    'b',
  planToken:     'x',
  comparisonPreview: { health: 'ok', summaryKey: 'cluster.alua.summary.ok', issues: [] },
  nodes: [
    {
      nodeId: 'b', hostname: 'esos2', deviceGroup: { name: 'esos', devices: [], targetGroups: [] },
      scstConfBefore: '', scstConfAfter: 'DEVICE_GROUP esos {}', configPatchSummary: [], warnings: [],
    },
    {
      nodeId: 'a', hostname: 'esos1', deviceGroup: { name: 'esos', devices: [], targetGroups: [] },
      scstConfBefore: '', scstConfAfter: 'DEVICE_GROUP esos {}', configPatchSummary: [], warnings: [],
    },
  ],
}

describe('alua-cluster-apply', () => {
  beforeEach(() => {
    writeMock.mockClear()
    execMock.mockClear()
    clearPlanTokens()
  })

  it('rejects wrong confirmation phrase', async () => {
    await expect(applyAluaClusterPlan(minimalPlan, 'wrong')).rejects.toMatchObject({ statusCode: 400 })
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('stops on first node failure', async () => {
    const result = await applyAluaClusterPlan(minimalPlan, ALUA_CONFIRMATION_PHRASE)
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(writeMock).not.toHaveBeenCalled()
  })
})
