import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScstConf } from '../server/utils/scst-conf-parser'
import { serializeScstConfig } from '../server/utils/scst-config-writer'

const FIXTURES = join(process.cwd(), 'tests/fixtures/scst-conf')

describe('scst.conf ALUA DEVICE_GROUP', () => {
  it('parses alua-two-node-a fixture', () => {
    const raw = readFileSync(join(FIXTURES, 'alua-two-node-a.conf'), 'utf8')
    const config = parseScstConf(raw)
    expect(config.deviceGroups).toHaveLength(1)
    const dg = config.deviceGroups[0]!
    expect(dg.name).toBe('esos')
    expect(dg.devices).toEqual(['linux_vol', 'data_vol'])
    const local = dg.targetGroups.find(t => t.name === 'local')!
    expect(local.groupId).toBe(1)
    expect(local.targets).toContain('iqn.2024-01.com.esos:node-a')
    const remote = dg.targetGroups.find(t => t.name === 'remote')!
    expect(remote.groupId).toBe(2)
    expect(remote.targets).toContain('iqn.2024-01.com.esos:node-b')
  })

  it('round-trips DEVICE_GROUP through serializer', () => {
    const raw = readFileSync(join(FIXTURES, 'alua-two-node-b.conf'), 'utf8')
    const config = parseScstConf(raw)
    const out = serializeScstConfig(config)
    const reparsed = parseScstConf(out)
    expect(reparsed.deviceGroups[0]).toEqual(config.deviceGroups[0])
  })
})
