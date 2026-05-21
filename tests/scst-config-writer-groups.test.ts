import { describe, it, expect } from 'vitest'
import { serializeScstConfig } from '../server/utils/scst-config-writer'
import type { ScstConfig } from '../types/esos'

describe('serializeScstConfig — groups and initiators', () => {
  const base: ScstConfig = {
    handlers: [],
    drivers: [
      {
        name: 'iscsi',
        targets: [
          {
            name: 'iqn.2000-01.com.example:t1',
            enabled: true,
            attrs: {},
            groups: [
              {
                name: 'servers',
                initiators: ['iqn.1994-05.com.redhat:client', 'iqn.1994-05.com.redhat:*'],
                luns: [{ id: 1, device: 'disk01', readOnly: false }],
              },
            ],
            luns: [],
          },
        ],
      },
    ],
  }

  it('emits GROUP, INITIATOR, and LUN lines', () => {
    const text = serializeScstConfig(base)
    expect(text).toContain('GROUP servers')
    expect(text).toContain('INITIATOR iqn.1994-05.com.redhat:client')
    expect(text).toContain('INITIATOR iqn.1994-05.com.redhat:*')
    expect(text).toContain('LUN 1 disk01')
  })
})
