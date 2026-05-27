import { describe, expect, it } from 'vitest'
import { parseLsblkLabelOutput, validateSelectedRootPartition } from '../server/utils/raid-missing-tools-preflight'

describe('raid-missing-tools preflight helpers', () => {
  it('parses lsblk label output', () => {
    const raw = [
      '/dev/sda2|esos_root|123',
      '/dev/sdb2|esos_root|456',
      '',
    ].join('\n')
    const parts = parseLsblkLabelOutput(raw)
    expect(parts).toEqual([
      { path: '/dev/sda2', label: 'esos_root', sizeBytes: 123 },
      { path: '/dev/sdb2', label: 'esos_root', sizeBytes: 456 },
    ])
  })

  it('validates selected root partition against detected list', () => {
    const parts = [
      { path: '/dev/sda2', label: 'esos_root', sizeBytes: 1 },
      { path: '/dev/sdb2', label: 'esos_root', sizeBytes: 2 },
    ]
    expect(validateSelectedRootPartition('/dev/sda2', parts)).toBe('/dev/sda2')
    expect(validateSelectedRootPartition('/dev/evil', parts)).toBeNull()
  })
})

