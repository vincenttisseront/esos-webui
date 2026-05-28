import { describe, expect, it } from 'vitest'
import { resolveRescanHost } from '../utils/hw-raid-rescan'

describe('resolveRescanHost', () => {
  it('prefers explicit host request', () => {
    expect(resolveRescanHost({ requestedHost: '3', scsiAddress: '1:0:0:0' })).toBe('3')
  })

  it('falls back to host from scsi address', () => {
    expect(resolveRescanHost({ requestedHost: '', scsiAddress: '1:2:0:0' })).toBe('1')
  })

  it('returns null when host cannot be determined', () => {
    expect(resolveRescanHost({ requestedHost: 'abc', scsiAddress: '' })).toBeNull()
  })
})
