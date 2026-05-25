import { describe, expect, it, vi, beforeEach } from 'vitest'

const runFsPreflightMock = vi.fn()
const runCreateVdiskMock = vi.fn().mockResolvedValue({ path: '/mnt/vdisks/fs01/f.img' })

vi.mock('../server/utils/fs-preflight', () => ({
  runFsPreflight: (...args: unknown[]) => runFsPreflightMock(...args),
}))
vi.mock('../server/utils/fs-overview.service', () => ({
  collectFsOverview: vi.fn().mockResolvedValue({}),
}))
vi.mock('../server/utils/ssh-pool', () => ({
  getSSHPool: vi.fn(() => ({
    get: () => ({ getStatus: () => 'connected' }),
  })),
}))
vi.mock('../server/utils/ssh-runtime', () => ({
  withSanContext: (_id: string, fn: () => unknown) => fn(),
}))
vi.mock('../server/utils/cluster-readonly', () => ({
  assertClusterNodesWritable: vi.fn(),
  resolveClusterEnabledNodes: vi.fn(() => [
    { id: 'node-a', label: 'A', readOnly: false },
    { id: 'node-b', label: 'B', readOnly: false },
  ]),
}))
vi.mock('../server/utils/fs-actions', () => ({
  runCreateFilesystem: vi.fn(),
  runCreateVdisk: (...args: unknown[]) => runCreateVdiskMock(...args),
  runBindFileio: vi.fn(),
}))
vi.mock('../server/utils/fs-api-helpers', () => ({
  invalidateFsCaches: vi.fn(),
}))

import {
  CLUSTER_FS_BLOCKED_MESSAGE,
  executeClusterVdiskCreate,
} from '../server/utils/fs-cluster-execution'

const vdiskPayload = {
  mountPoint: '/mnt/vdisks/fs01',
  fileName: 'data01.img',
  sizeBytes: 2_000_000_000,
  allocMode: 'fallocate' as const,
  confirmation: 'CREATE_VDISK /mnt/vdisks/fs01/data01.img',
}

describe('fs-cluster-execution', () => {
  beforeEach(() => {
    runFsPreflightMock.mockReset()
    runCreateVdiskMock.mockClear()
    runFsPreflightMock.mockResolvedValue({
      ok: true,
      blockers: [],
      requiredConfirmation: vdiskPayload.confirmation,
      configPreview: [],
      commands: [],
      warnings: [],
    })
  })

  it('exports blocked message constant', () => {
    expect(CLUSTER_FS_BLOCKED_MESSAGE).toContain('cluster')
  })

  it('rejects wrong confirmation on primary preflight', async () => {
    await expect(
      executeClusterVdiskCreate('primary', 'cluster-1', {
        ...vdiskPayload,
        confirmation: 'wrong phrase',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(runCreateVdiskMock).not.toHaveBeenCalled()
  })

  it('throws 409 when a node preflight fails', async () => {
    runFsPreflightMock
      .mockResolvedValueOnce({
        ok: true,
        blockers: [],
        requiredConfirmation: vdiskPayload.confirmation,
        configPreview: [],
        commands: [],
        warnings: [],
      })
      .mockResolvedValueOnce({ ok: true, blockers: [], configPreview: [], commands: [], warnings: [] })
      .mockResolvedValueOnce({ ok: false, blockers: ['espace insuffisant'], configPreview: [], commands: [], warnings: [] })

    await expect(
      executeClusterVdiskCreate('primary', 'cluster-1', vdiskPayload),
    ).rejects.toMatchObject({ statusCode: 409 })

    expect(runCreateVdiskMock).toHaveBeenCalledTimes(1)
  })

  it('succeeds when all nodes pass', async () => {
    const res = await executeClusterVdiskCreate('primary', 'cluster-1', vdiskPayload)
    expect(res.success).toBe(true)
    expect(res.nodeResults).toHaveLength(2)
    expect(runCreateVdiskMock).toHaveBeenCalledTimes(2)
  })
})
