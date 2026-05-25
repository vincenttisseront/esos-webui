import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScstConfig } from '../types/esos'
import { expectedDeleteGroupConfirmation } from '../utils/scst-initiator-validation'

const readScstConfigMock = vi.fn<() => Promise<ScstConfig>>()

vi.mock('../server/utils/scst-config-reader', () => ({
  readScstConfig: () => readScstConfigMock(),
}))

import {
  preflightCreateGroup,
  preflightDeleteGroup,
  preflightAddInitiator,
  preflightRemoveInitiator,
} from '../server/utils/scst-hosts-preflight'

const TARGET = 'iqn.2000-01.com.example:t1'

function baseConfig(): ScstConfig {
  return {
    handlers: [],
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
              { name: 'empty', initiators: [], luns: [] },
            ],
            luns: [],
            sessions: [
              {
                initiatorName: 'iqn.1994-05.com.redhat:client',
                target: TARGET,
                driver: 'iscsi',
                ipAddr: '',
                sid: '1',
              },
            ],
          },
        ],
      },
    ],
  }
}

describe('scst-hosts-preflight', () => {
  beforeEach(() => {
    readScstConfigMock.mockReset()
    readScstConfigMock.mockResolvedValue(baseConfig())
  })

  it('create_group — ok with preview', async () => {
    const res = await preflightCreateGroup(TARGET, 'newgrp')
    expect(res.ok).toBe(true)
    expect(res.configPreview.join('\n')).toContain('GROUP newgrp')
    expect(res.blockers).toHaveLength(0)
  })

  it('create_group — blocks duplicate name', async () => {
    const res = await preflightCreateGroup(TARGET, 'servers')
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.includes('servers'))).toBe(true)
  })

  it('delete_group — requires confirmation when non-empty', async () => {
    const res = await preflightDeleteGroup(TARGET, 'servers')
    expect(res.ok).toBe(true)
    expect(res.requiredConfirmation).toBe(
      expectedDeleteGroupConfirmation(TARGET, 'servers'),
    )
    expect(res.warnings.length).toBeGreaterThan(0)
  })

  it('delete_group — empty group has no forced confirmation', async () => {
    const res = await preflightDeleteGroup(TARGET, 'empty')
    expect(res.ok).toBe(true)
    expect(res.requiredConfirmation).toBeUndefined()
  })

  it('add_initiator — warns on active session', async () => {
    const res = await preflightAddInitiator(
      TARGET,
      'empty',
      'iqn.1994-05.com.redhat:client',
      'iscsi',
    )
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.toLowerCase().includes('déjà'))).toBe(true)
  })

  it('add_initiator — ok for new initiator', async () => {
    const res = await preflightAddInitiator(
      TARGET,
      'empty',
      'iqn.1994-05.com.redhat:newhost',
      'iscsi',
    )
    expect(res.ok).toBe(true)
    expect(res.configPreview).toContain('INITIATOR iqn.1994-05.com.redhat:newhost')
  })

  it('remove_initiator — warns stop I/O and active session', async () => {
    const res = await preflightRemoveInitiator(
      TARGET,
      'servers',
      'iqn.1994-05.com.redhat:client',
    )
    expect(res.ok).toBe(true)
    expect(res.warnings.some(w => w.toLowerCase().includes('i/o'))).toBe(true)
    expect(res.warnings.some(w => w.toLowerCase().includes('session'))).toBe(true)
  })

  it('remove_initiator — blocks unknown initiator', async () => {
    const res = await preflightRemoveInitiator(TARGET, 'servers', 'iqn.missing:host')
    expect(res.ok).toBe(false)
    expect(res.blockers.length).toBeGreaterThan(0)
  })
})
