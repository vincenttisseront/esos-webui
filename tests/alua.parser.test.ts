import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flattenAluaGroups } from '../server/utils/alua-model'
import { parseALUASysfs } from '../server/utils/parsers/alua.parser'

const FIXTURES = join(process.cwd(), 'tests/fixtures/alua-sysfs')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

describe('parseALUASysfs', () => {
  it('parses device groups, states, group_id, devices, and targets', () => {
    const groups = parseALUASysfs(loadFixture('two-node-symmetric.txt'))
    expect(groups.map(g => g.name)).toEqual(['esos', 'shared'])

    const esos = groups.find(g => g.name === 'esos')!
    expect(esos.devices).toEqual(['data_vol', 'linux_vol'])

    const local = esos.targetGroups.find(t => t.name === 'local')!
    expect(local.state).toBe('active')
    expect(local.groupId).toBe(1)
    expect(local.role).toBe('local')
    expect(local.targets).toEqual([
      { targetName: 'iqn.2024-01.com.esos:node1', relTargetId: 101 },
    ])

    const remote = esos.targetGroups.find(t => t.name === 'remote')!
    expect(remote.state).toBe('nonoptimized')
    expect(remote.groupId).toBe(2)
    expect(remote.role).toBe('remote')
  })

  it('returns empty array for missing ALUA sysfs', () => {
    expect(parseALUASysfs(loadFixture('node-missing-alua.txt'))).toEqual([])
  })

  it('flattenAluaGroups matches legacy flat fingerprint shape', () => {
    const groups = parseALUASysfs(loadFixture('two-node-symmetric.txt'))
    const flat = flattenAluaGroups(groups)
    expect(flat.some(g => g.deviceGroup === 'esos' && g.targetGroup === 'local' && g.state === 'active')).toBe(true)
    expect(flat.find(g => g.targetGroup === 'local')?.targets).toContain('iqn.2024-01.com.esos:node1')
  })
})
