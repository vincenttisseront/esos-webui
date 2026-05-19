import { describe, expect, it } from 'vitest'
import { expectedMdStopConfirmation } from '../server/utils/raid-md-actions'

describe('expectedMdStopConfirmation', () => {
  it('returns STOP {name} phrase', () => {
    expect(expectedMdStopConfirmation('md0')).toBe('STOP md0')
  })
})
