import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { splitAdvStorageSections } from '../server/utils/advanced-storage-collector'
import { parseMultipathLl } from '../server/utils/parsers/advanced-storage/multipath.parser'

const FIX = join(__dirname, 'fixtures/advanced-storage')

describe('advanced-storage collector sections', () => {
  it('splits probe markers and parses multipath section', () => {
    const mp = readFileSync(join(FIX, 'multipath-ll.txt'), 'utf8')
    const rc = readFileSync(join(FIX, 'rc-advanced.conf'), 'utf8')
    const raw = [
      '%%TOOLS%%',
      'drbdadm=/sbin/drbdadm',
      'bcache_sysfs=0',
      '%%RCCONF%%',
      rc,
      '%%SVCSTATUS%%',
      'drbd=running',
      '%%DRBD_JSON%%',
      'DRBD_UNAVAILABLE',
      '%%DRBD_PROC%%',
      'DRBD_UNAVAILABLE',
      '%%DRBD_RCCONF%%',
      'rc.drbd_enable=YES',
      '%%DRBD_SVC%%',
      'drbd=running',
      '%%MULTIPATH%%',
      mp,
      '%%ZPOOL%%',
      '%%ZFSLIST%%',
      '%%MHVTL%%',
      '%%BCACHE%%',
      '%%DMCACHE%%',
      '%%LVMCACHE%%',
      '%%RBD%%',
      '%%RBDMAP%%',
      '%%DEPRECATED%%',
      'lessfs=0',
      '%%LSBLK_ADV%%',
      '{}',
      '%%END%%',
    ].join('\n')

    const sections = splitAdvStorageSections(raw)
    expect(sections.TOOLS).toContain('drbdadm=')
    expect(sections.RCCONF).toContain('rc.drbd_enable')
    const maps = parseMultipathLl(sections.MULTIPATH ?? '')
    expect(maps.length).toBeGreaterThanOrEqual(2)
  })
})
