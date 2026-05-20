import { describe, expect, it } from 'vitest'
import { formatLvmBytes, formatLvSizeGibLabel, validateLvCreateSizeGib } from '../utils/lvm-lv-wizard-ui'

describe('lvm-lv-wizard-ui', () => {
  it('validateLvCreateSizeGib rejects zero', () => {
    expect(validateLvCreateSizeGib(0, 50 * 1024 ** 3)).toBe('zero')
  })

  it('validateLvCreateSizeGib rejects exceeds max', () => {
    expect(validateLvCreateSizeGib(100, 50 * 1024 ** 3)).toBe('exceeds')
  })

  it('validateLvCreateSizeGib accepts valid size', () => {
    expect(validateLvCreateSizeGib(10, 50 * 1024 ** 3)).toBe(null)
  })

  it('formatLvSizeGibLabel shows GiB', () => {
    expect(formatLvSizeGibLabel(10)).toBe('10 GiB')
  })

  it('formatLvmBytes formats gibibytes', () => {
    expect(formatLvmBytes(50 * 1024 ** 3)).toBe('50.0 GiB')
  })
})
