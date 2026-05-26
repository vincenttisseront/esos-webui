import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScstConf } from '../server/utils/scst-conf-parser'
import { runAluaWizardPreflight, type PreflightNodeContext } from '../server/utils/alua-wizard-preflight'
import type { ClusterSanMember } from '../server/utils/cluster-resolve'

const FIXTURES = join(process.cwd(), 'tests/fixtures/scst-conf')

function member(id: string, label: string): ClusterSanMember {
  return {
    id,
    label,
    host: '10.0.0.1',
    port: 22,
    status: 'active',
    readOnly: false,
    clusterEnabled: true,
    clusterRole: 'primary',
    clusterId: 'c1',
    clusterPeer: null,
  }
}

function nodeCtx(id: string, label: string, file: string, overrides?: Partial<PreflightNodeContext>): PreflightNodeContext {
  return {
    nodeId:            id,
    hostname:          label,
    config:            parseScstConf(readFileSync(join(FIXTURES, file), 'utf8')),
    readOnly:          false,
    sshReady:          true,
    sysfsDeviceGroups: [],
    ...overrides,
  }
}

describe('alua-wizard-preflight', () => {
  it('blocks when fewer than two nodes', () => {
    const res = runAluaWizardPreflight([member('a', 'esos1')], [nodeCtx('a', 'esos1', 'alua-two-node-a.conf')])
    expect(res.ok).toBe(false)
    expect(res.blockers.some(b => b.code === 'min_nodes')).toBe(true)
    expect(res.canExecute).toBe(false)
  })

  it('blocks read-only nodes', () => {
    const res = runAluaWizardPreflight(
      [member('a', 'esos1'), member('b', 'esos2')],
      [
        nodeCtx('a', 'esos1', 'alua-two-node-a.conf'),
        nodeCtx('b', 'esos2', 'alua-two-node-b.conf', { readOnly: true }),
      ],
    )
    expect(res.blockers.some(b => b.code === 'read_only')).toBe(true)
  })

  it('blocks invalid target reference in assignments', () => {
    const res = runAluaWizardPreflight(
      [member('a', 'esos1'), member('b', 'esos2')],
      [nodeCtx('a', 'esos1', 'alua-two-node-a.conf'), nodeCtx('b', 'esos2', 'alua-two-node-b.conf')],
      {
        clusterId:       'c1',
        assignments:     [{ nodeId: 'a', targetName: 'iqn.does.not.exist', role: 'local' }],
        deviceGroupName: 'esos',
        deviceNames:     ['linux_vol'],
        mode:            'replace',
      },
    )
    expect(res.blockers.some(b => b.code === 'invalid_target_reference')).toBe(true)
  })
})
