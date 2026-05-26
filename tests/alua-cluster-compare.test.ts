import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildAluaNodeSnapshot,
  compareAluaCluster,
  compareScstAluaFingerprintSymmetry,
} from '../server/utils/alua-cluster-compare'
import { parseALUASysfs } from '../server/utils/parsers/alua.parser'

const FIXTURES = join(process.cwd(), 'tests/fixtures/alua-sysfs')

function nodeFromFixture(id: string, file: string) {
  const deviceGroups = parseALUASysfs(readFileSync(join(FIXTURES, file), 'utf8'))
  return buildAluaNodeSnapshot(id, id, `${id}.local`, true, deviceGroups)
}

describe('compareAluaCluster', () => {
  it('reports ok for symmetric two-node local/remote with reversed IDs', () => {
    const mkEsos = (localId: number, remoteId: number, localTargets: string[], remoteTargets: string[]) => [{
      name:         'esos',
      devices:      [] as string[],
      targetGroups: [
        {
          name: 'local', groupId: localId, state: 'active' as const, role: 'local' as const,
          targets: localTargets.map(targetName => ({ targetName })),
        },
        {
          name: 'remote', groupId: remoteId, state: 'nonoptimized' as const, role: 'remote' as const,
          targets: remoteTargets.map(targetName => ({ targetName })),
        },
      ],
    }]
    const nodeA = buildAluaNodeSnapshot('a', 'esos1', '10.0.0.1', true, mkEsos(1, 2, ['tgt-a'], ['tgt-b']))
    const nodeB = buildAluaNodeSnapshot('b', 'esos2', '10.0.0.2', true, mkEsos(2, 1, ['tgt-b'], ['tgt-a']))

    const result = compareAluaCluster([nodeA, nodeB], { expectLocalRemotePair: true })
    expect(result.health).toBe('ok')
    expect(result.issues.filter(i => i.severity === 'error')).toHaveLength(0)
  })

  it('flags missing_alua_config when sysfs empty', () => {
    const node = buildAluaNodeSnapshot('a', 'esos1', '10.0.0.1', true, [])
    const result = compareAluaCluster([node, node], { expectLocalRemotePair: false })
    expect(result.issues.some(i => i.code === 'missing_alua_config')).toBe(true)
    expect(result.health).toBe('missing')
  })

  it('flags group_id_not_reversed when IDs are not swapped across peers', () => {
    const groups = parseALUASysfs(readFileSync(join(FIXTURES, 'asymmetric-group-ids.txt'), 'utf8'))
    const nodeA = buildAluaNodeSnapshot('a', 'esos1', '10.0.0.1', true, groups)
    const nodeB = buildAluaNodeSnapshot('b', 'esos2', '10.0.0.2', true, groups)
    const result = compareAluaCluster([nodeA, nodeB])
    expect(result.issues.some(i => i.code === 'group_id_not_reversed')).toBe(true)
    expect(result.health).toBe('asymmetric')
  })

  it('flags invalid_target_reference when SCST conf lacks target', () => {
    const node = nodeFromFixture('a', 'with-invalid-target-names.txt')
    const scstTargetsByNode = new Map([['a', new Set(['iqn.valid.only'])]])
    const result = compareAluaCluster([node, node], {
      expectLocalRemotePair: false,
      scstTargetsByNode,
    })
    expect(result.issues.some(i => i.code === 'invalid_target_reference')).toBe(true)
    expect(result.health).toBe('invalid_refs')
  })

  it('flags asymmetric_device_groups when DG sets differ', () => {
    const full = nodeFromFixture('a', 'two-node-symmetric.txt')
    const partial = buildAluaNodeSnapshot('b', 'esos2', '10.0.0.2', true, full.deviceGroups.slice(0, 1))
    const result = compareAluaCluster([full, partial])
    expect(result.issues.some(i => i.code === 'asymmetric_device_groups')).toBe(true)
  })
})

describe('compareScstAluaFingerprintSymmetry', () => {
  it('returns symmetric when fingerprints match', () => {
    const groups = parseALUASysfs(readFileSync(join(FIXTURES, 'two-node-symmetric.txt'), 'utf8'))
    const res = compareScstAluaFingerprintSymmetry([
      { sshReady: true, deviceGroups: groups },
      { sshReady: true, deviceGroups: groups },
    ])
    expect(res.symmetric).toBe(true)
    expect(res.summaryKey).toBe('cluster.alua.scst.symmetric')
  })
})
