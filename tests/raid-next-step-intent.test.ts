import { describe, expect, it } from 'vitest'
import {
  buildRaidNextStepQuery,
  clearRaidNextStepQuery,
  parseRaidNextStepIntent,
} from '../utils/raid-next-step-intent'

describe('raid next-step intent query', () => {
  it('builds lvm create-pv query with device', () => {
    const q = buildRaidNextStepQuery(
      { clusterId: 'c1' },
      { tab: 'lvm', intent: 'create-pv', device: '/dev/sdb' },
    )
    expect(q.tab).toBe('lvm')
    expect(q.intent).toBe('create-pv')
    expect(q.device).toBe('/dev/sdb')
    expect(q.clusterId).toBe('c1')
  })

  it('parses filesystems create-filesystem query', () => {
    const parsed = parseRaidNextStepIntent({
      tab: 'filesystems',
      intent: 'create-filesystem',
      device: '/dev/sdb',
    })
    expect(parsed).toEqual({
      tab: 'filesystems',
      intent: 'create-filesystem',
      device: '/dev/sdb',
    })
  })

  it('parses lvm create-pv query', () => {
    const parsed = parseRaidNextStepIntent({
      tab: 'lvm',
      intent: 'create-pv',
      device: '/dev/sdb',
    })
    expect(parsed?.tab).toBe('lvm')
    expect(parsed?.intent).toBe('create-pv')
    expect(parsed?.device).toBe('/dev/sdb')
  })

  it('clears intent keys while preserving tab', () => {
    const q = clearRaidNextStepQuery({
      tab: 'filesystems',
      intent: 'create-filesystem',
      device: '/dev/sdb',
      foo: 'bar',
    })
    expect(q).toEqual({ tab: 'filesystems', foo: 'bar' })
  })
})
