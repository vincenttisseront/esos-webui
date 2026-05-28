import { describe, expect, it } from 'vitest'
import { parseStorCliLogicalDriveId } from '../server/utils/raid-hardware'

describe('parseStorCliLogicalDriveId', () => {
  it('uses DG/VD when present', () => {
    expect(parseStorCliLogicalDriveId('0', { 'DG/VD': '0/1', Size: '223 GB' }, 0)).toBe('0/vd1')
  })

  it('falls back to array index when DG/VD missing', () => {
    expect(parseStorCliLogicalDriveId('0', { Size: '1 TB' }, 2)).toBe('0/vd2')
  })

  it('parses VD field when DG/VD missing', () => {
    expect(parseStorCliLogicalDriveId('0', { VD: '1' }, 0)).toBe('0/vd1')
  })
})
