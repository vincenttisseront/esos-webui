import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseMultipathLl } from '../server/utils/parsers/advanced-storage/multipath.parser'
import { parseDmCacheTable } from '../server/utils/parsers/advanced-storage/dm-cache.parser'
import { parseLvmCacheLvs } from '../server/utils/parsers/advanced-storage/lvm-cache.parser'
import { parseRbdShowmapped } from '../server/utils/parsers/advanced-storage/rbd.parser'
import { parseAdvancedRcConf } from '../server/utils/parsers/advanced-storage/rcconf-advanced.parser'

const FIX = join(__dirname, 'fixtures/advanced-storage')

describe('advanced-storage parsers', () => {
  it('parses multipath -ll maps', () => {
    const raw = readFileSync(join(FIX, 'multipath-ll.txt'), 'utf8')
    const maps = parseMultipathLl(raw)
    expect(maps.length).toBeGreaterThanOrEqual(2)
    expect(maps[0]?.alias).toMatch(/mpath/)
    expect(maps[0]?.pathCount).toBeGreaterThan(0)
  })

  it('parses dm-cache table lines', () => {
    const raw = readFileSync(join(FIX, 'dmsetup-cache.txt'), 'utf8')
    const targets = parseDmCacheTable(raw)
    expect(targets.some(t => t.name === 'cache_vol')).toBe(true)
    expect(targets[0]?.cacheMode).toMatch(/writethrough/i)
  })

  it('parses LVM cache lvs output', () => {
    const raw = readFileSync(join(FIX, 'lvs-cache.txt'), 'utf8')
    const vols = parseLvmCacheLvs(raw)
    expect(vols.length).toBe(1)
    expect(vols[0]?.segtype).toMatch(/cache/i)
  })

  it('parses rbd showmapped', () => {
    const raw = readFileSync(join(FIX, 'rbd-mapped.txt'), 'utf8')
    const maps = parseRbdShowmapped(raw)
    expect(maps).toHaveLength(2)
    expect(maps[0]?.device).toBe('/dev/rbd0')
    expect(maps[0]?.pool).toBe('rbdpool')
  })

  it('parses advanced rc.conf flags', () => {
    const raw = readFileSync(join(FIX, 'rc-advanced.conf'), 'utf8')
    const rc = parseAdvancedRcConf(raw)
    expect(rc.drbd).toBe(true)
    expect(rc.multipathd).toBe(true)
    expect(rc.mhvtl).toBe(false)
    expect(rc.dmcache).toBe(true)
  })
})
