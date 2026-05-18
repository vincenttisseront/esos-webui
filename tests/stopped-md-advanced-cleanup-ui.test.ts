import { describe, expect, it } from 'vitest'
import { advancedCleanupMembersForArray } from '../utils/stopped-md'

describe('advanced cleanup UI helpers', () => {
  it('advancedCleanupMembersForArray returns intersection with pending keys', () => {
    const pending = {
      '/dev/sda1': { partition: '/dev/sda1' },
      '/dev/sdb1': { partition: '/dev/sdb1' },
    }
    expect(advancedCleanupMembersForArray(['/dev/sda1', '/dev/sdc1'], pending)).toEqual(['/dev/sda1'])
    expect(advancedCleanupMembersForArray([], pending)).toEqual([])
  })
})
