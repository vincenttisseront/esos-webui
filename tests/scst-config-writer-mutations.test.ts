import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScstConfig } from '../types/esos'

const readScstConfigMock = vi.fn<() => Promise<ScstConfig>>()
const writeRemoteMock = vi.fn().mockResolvedValue(undefined)
const sshExecMock = vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 })

vi.mock('../server/utils/scst-config-reader', () => ({
  readScstConfig: () => readScstConfigMock(),
}))

vi.mock('../server/utils/remote-file-writer', () => ({
  writeRemoteFileAtomicOrThrow: (...args: unknown[]) => writeRemoteMock(...args),
}))

vi.mock('../server/utils/ssh-runtime', () => ({
  getActiveSSHManager: () => ({ exec: sshExecMock }),
}))

import { createGroup, deleteGroup, addInitiator, addLunToGroup } from '../server/utils/scst-config-writer'

const TARGET = 'iqn.2000-01.com.example:t1'

function baseConfig(): ScstConfig {
  return {
    deviceGroups: [],
    handlers: [
      {
        name: 'vdisk_blockio',
        devices: [
          { name: 'disk01', handler: 'vdisk_blockio', filename: '/dev/sda', attrs: {} },
          { name: 'disk02', handler: 'vdisk_blockio', filename: '/dev/sdb', attrs: {} },
        ],
      },
      {
        name: 'vdisk_fileio',
        devices: [
          { name: 'file01', handler: 'vdisk_fileio', filename: '/mnt/data/vdisk1', attrs: {} },
        ],
      },
    ],
    drivers: [
      {
        name: 'iscsi',
        targets: [
          {
            name: TARGET,
            enabled: true,
            attrs: {},
            groups: [
              {
                name: 'servers',
                initiators: ['iqn.1994-05.com.redhat:client'],
                luns: [{ id: 1, device: 'disk01', readOnly: false }],
              },
            ],
            luns: [],
            sessions: [],
          },
        ],
      },
    ],
  }
}

describe('scst-config-writer — host mutations', () => {
  beforeEach(() => {
    readScstConfigMock.mockReset()
    readScstConfigMock.mockImplementation(async () => structuredClone(baseConfig()))
    writeRemoteMock.mockClear()
    sshExecMock.mockClear()
  })

  function writtenContent(): string {
    return writeRemoteMock.mock.calls[0][2] as string
  }

  it('createGroup — rejects duplicate group', async () => {
    await expect(createGroup(TARGET, 'servers')).rejects.toThrow(/existe déjà/)
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('createGroup — writes new group', async () => {
    await createGroup(TARGET, 'newgrp')
    expect(writeRemoteMock).toHaveBeenCalledOnce()
    expect(writtenContent()).toContain('GROUP newgrp')
  })

  it('deleteGroup — blocks initiators without force', async () => {
    await expect(deleteGroup(TARGET, 'servers')).rejects.toThrow(/initiateur/)
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('deleteGroup — blocks LUNs without force', async () => {
    const cfg = baseConfig()
    cfg.drivers[0].targets[0].groups[0].initiators = []
    readScstConfigMock.mockResolvedValue(cfg)
    await expect(deleteGroup(TARGET, 'servers')).rejects.toThrow(/LUN/)
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('deleteGroup — force removes group', async () => {
    await deleteGroup(TARGET, 'servers', { force: true })
    expect(writeRemoteMock).toHaveBeenCalledOnce()
    expect(writtenContent()).not.toContain('GROUP servers')
  })

  it('addInitiator — rejects duplicate in same group', async () => {
    await expect(
      addInitiator(TARGET, 'servers', 'iqn.1994-05.com.redhat:client', { type: 'iscsi' }),
    ).rejects.toThrow(/déjà présent/)
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('addInitiator — writes new initiator', async () => {
    await addInitiator(TARGET, 'servers', 'iqn.1994-05.com.redhat:newhost', { type: 'iscsi' })
    expect(writeRemoteMock).toHaveBeenCalledOnce()
    expect(writtenContent()).toContain('iqn.1994-05.com.redhat:newhost')
  })

  it('addLunToGroup — rejects duplicate LUN id in group', async () => {
    await expect(addLunToGroup(TARGET, 'servers', 1, 'disk02')).rejects.toThrow()
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('addLunToGroup — rejects already mapped device', async () => {
    await expect(addLunToGroup(TARGET, 'servers', 2, 'disk01')).rejects.toThrow()
    expect(writeRemoteMock).not.toHaveBeenCalled()
  })

  it('addLunToGroup — writes BLOCKIO LUN', async () => {
    await addLunToGroup(TARGET, 'servers', 2, 'disk02')
    expect(writeRemoteMock).toHaveBeenCalledOnce()
    expect(writtenContent()).toContain('LUN 2 disk02')
  })

  it('addLunToGroup — writes FILEIO LUN with read_only', async () => {
    await addLunToGroup(TARGET, 'servers', 3, 'file01', { readOnly: true })
    expect(writeRemoteMock).toHaveBeenCalledOnce()
    expect(writtenContent()).toContain('LUN 3 file01')
    expect(writtenContent()).toContain('read_only 1')
  })
})
