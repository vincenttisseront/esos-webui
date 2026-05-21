import { describe, expect, it } from 'vitest'
import {
  mergeMountWithDf,
  parseFindmntLines,
  parseFstabLines,
} from '~/utils/fs-overview-parser'

describe('fs-overview-parser', () => {
  it('parses findmnt lines', () => {
    const stdout = `TARGET SOURCE FSTYPE
/mnt/vdisks/fs01 /dev/md0 xfs`
    const rows = parseFindmntLines(stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].target).toBe('/mnt/vdisks/fs01')
  })

  it('merges df bytes', () => {
    const findmnt = [{ target: '/mnt/x', source: '/dev/md0', fstype: 'xfs' }]
    const df = new Map([['/mnt/x', { totalBytes: 1000, usedBytes: 400, availBytes: 600 }]])
    const mounts = mergeMountWithDf(findmnt, df)
    expect(mounts[0].totalBytes).toBe(1000)
    expect(mounts[0].freeBytes).toBe(600)
    expect(mounts[0].usedPct).toBe(40)
  })

  it('parses fstab by mount point', () => {
    const map = parseFstabLines('UUID=abc /mnt/vdisks/fs01 xfs defaults 0 0\n')
    expect(map.get('/mnt/vdisks/fs01')).toContain('UUID=abc')
  })
})
