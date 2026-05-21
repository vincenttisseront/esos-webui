import { describe, expect, it } from 'vitest'
import {
  buildMountRow,
  mergeMountSources,
  parseFindmntJson,
  parseFindmntLines,
  parseFstabLines,
  parseLsblkMounts,
} from '~/utils/fs-overview-parser'

describe('fs-overview-parser', () => {
  it('parses findmnt lines', () => {
    const stdout = `TARGET SOURCE FSTYPE
/mnt/vdisks/fs01 /dev/md0 xfs`
    const rows = parseFindmntLines(stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].target).toBe('/mnt/vdisks/fs01')
  })

  it('parses findmnt -J', () => {
    const stdout = JSON.stringify({
      filesystems: [
        { target: '/mnt/vdisks/fs01', source: '/dev/md0', fstype: 'xfs' },
        { target: '/proc', source: 'proc', fstype: 'proc' },
      ],
    })
    const rows = parseFindmntJson(stdout)
    expect(rows).toHaveLength(1)
    expect(rows[0].fstype).toBe('xfs')
  })

  it('parses lsblk mounts under vdisks', () => {
    const stdout = JSON.stringify({
      blockdevices: [
        {
          name: 'md0',
          path: '/dev/md0',
          fstype: 'xfs',
          mountpoint: '/mnt/vdisks/fs01',
        },
      ],
    })
    const rows = parseLsblkMounts(stdout)
    expect(rows[0].target).toBe('/mnt/vdisks/fs01')
  })

  it('merges mount sources preferring findmnt', () => {
    const merged = mergeMountSources([
      { rows: [{ target: '/mnt/a', source: '/dev/sda1', fstype: 'xfs' }], source: 'findmnt' },
      { rows: [{ target: '/mnt/b', source: '/dev/sdb1', fstype: 'ext4' }], source: 'lsblk' },
      { rows: [{ target: '/mnt/a', source: '/dev/sda1', fstype: 'ext4' }], source: 'df' },
    ])
    expect(merged.size).toBe(2)
    expect(merged.get('/mnt/a')?.fstype).toBe('xfs')
    expect(merged.get('/mnt/a')?.sourceKind).toBe('findmnt')
  })

  it('buildMountRow applies df bytes and health', () => {
    const row = buildMountRow(
      { target: '/mnt/x', source: '/dev/md0', fstype: 'xfs' },
      { totalBytes: 1000, usedBytes: 900, availBytes: 100 },
      'findmnt',
    )
    expect(row.totalBytes).toBe(1000)
    expect(row.freeBytes).toBe(100)
    expect(row.usedPct).toBe(90)
    expect(row.health).toBe('degraded')
    expect(row.status).toBe('mounted')
  })

  it('parses fstab by mount point', () => {
    const map = parseFstabLines('UUID=abc /mnt/vdisks/fs01 xfs defaults 0 0\n')
    expect(map.get('/mnt/vdisks/fs01')).toContain('UUID=abc')
  })
})
