import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScstConf } from '../server/utils/scst-conf-parser'
import {
  buildAluaClusterPlan,
  buildDeviceGroupForNode,
  defaultAssignmentsForTwoNodes,
} from '../server/utils/alua-wizard-plan'
import type { AluaWizardRequest } from '../types/alua'

const FIXTURES = join(process.cwd(), 'tests/fixtures/scst-conf')

function loadNode(file: string, nodeId: string, hostname: string) {
  return {
    nodeId,
    hostname,
    config: parseScstConf(readFileSync(join(FIXTURES, file), 'utf8')),
  }
}

describe('alua-wizard-plan', () => {
  const nodeA = loadNode('alua-two-node-a.conf', 'a', 'esos1')
  const nodeB = loadNode('alua-two-node-b.conf', 'b', 'esos2')

  const baseReq = (): AluaWizardRequest => ({
    clusterId:        'cluster-1',
    primaryNodeId:    'a',
    deviceGroupName:  'esos',
    deviceNames:      ['linux_vol', 'data_vol'],
    targetGroupNames: { local: 'local', remote: 'remote' },
    groupIdsOnPrimary: { local: 1, remote: 2 },
    assignments:      defaultAssignmentsForTwoNodes(
      'a', 'b',
      ['iqn.2024-01.com.esos:node-a'],
      ['iqn.2024-01.com.esos:node-b'],
    ),
    mode: 'replace',
  })

  it('reverses group IDs on peer node', () => {
    const req = baseReq()
    const dgA = buildDeviceGroupForNode(req, 'a', 'b', true)
    const dgB = buildDeviceGroupForNode(req, 'b', 'a', false)
    expect(dgA.targetGroups.find(t => t.name === 'local')!.groupId).toBe(1)
    expect(dgA.targetGroups.find(t => t.name === 'remote')!.groupId).toBe(2)
    expect(dgB.targetGroups.find(t => t.name === 'local')!.groupId).toBe(2)
    expect(dgB.targetGroups.find(t => t.name === 'remote')!.groupId).toBe(1)
  })

  it('mirrors target sets across nodes', () => {
    const req = baseReq()
    const dgA = buildDeviceGroupForNode(req, 'a', 'b', true)
    const dgB = buildDeviceGroupForNode(req, 'b', 'a', false)
    expect(dgA.targetGroups.find(t => t.name === 'local')!.targets).toEqual(['iqn.2024-01.com.esos:node-a'])
    expect(dgA.targetGroups.find(t => t.name === 'remote')!.targets).toEqual(['iqn.2024-01.com.esos:node-b'])
    expect(dgB.targetGroups.find(t => t.name === 'local')!.targets).toEqual(['iqn.2024-01.com.esos:node-b'])
    expect(dgB.targetGroups.find(t => t.name === 'remote')!.targets).toEqual(['iqn.2024-01.com.esos:node-a'])
  })

  it('buildAluaClusterPlan produces token and symmetric preview', () => {
    const plan = buildAluaClusterPlan(baseReq(), [nodeA, nodeB])
    expect(plan.planToken).toHaveLength(32)
    expect(plan.nodes).toHaveLength(2)
    expect(plan.comparisonPreview.health).toBe('ok')
  })
})
