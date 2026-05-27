import { describe, expect, it } from 'vitest'
import { inferControllerVendorFromPciEvidence, parseWhichAndPaths } from '../server/utils/raid-missing-tools'

describe('raid-missing-tools detection helpers', () => {
  it('parses which output and direct paths', () => {
    const out = [
      '/usr/local/sbin/perccli64',
      'storcli64',
      '',
    ].join('\n')
    const r = parseWhichAndPaths(out)
    expect(r.perccli64).toBe(true)
    expect(r.storcli64).toBe(true)
    expect(r.resolvedPath).toBe('/usr/local/sbin/perccli64')
  })

  it('infers vendor from pci evidence', () => {
    expect(inferControllerVendorFromPciEvidence('Dell PERC H730P Mini')).toBe('dell_perc')
    expect(inferControllerVendorFromPciEvidence('Broadcom / Avago MegaRAID')).toBe('lsi_megaraid')
    expect(inferControllerVendorFromPciEvidence('')).toBeNull()
  })
})

