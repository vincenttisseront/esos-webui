import { describe, it, expect } from 'vitest'
import { discoveredInitiatorsForTarget } from '../utils/scst-discovered-initiators'
import type { Target } from '../types/esos'

describe('discoveredInitiatorsForTarget', () => {
  it('returns session initiators not in groups', () => {
    const target = {
      groups: [{ name: 'g1', initiators: ['iqn.a'], luns: [] }],
      sessions: [
        { initiatorName: 'iqn.b', targetName: 't', sessionId: '1' },
        { initiatorName: 'iqn.a', targetName: 't', sessionId: '2' },
      ],
    } as unknown as Target
    expect(discoveredInitiatorsForTarget(target)).toEqual(['iqn.b'])
  })
})
