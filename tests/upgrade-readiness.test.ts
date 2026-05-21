import { describe, it, expect } from 'vitest'
import {
  parseProbeSections,
  parseTmpFreeBytes,
  parseRamAvailableMb,
  evaluateNodeChecksFromProbe,
  levelFromChecks,
  aggregateOverallLevel,
  REQUIRED_TMP_BYTES,
} from '../server/utils/upgrade-readiness'
import type { UpgradeNodeReadiness } from '../types/upgrade'

describe('parseProbeSections', () => {
  it('splits marked sections', () => {
    const raw = '%%VERSION%%\n3.0.1\n%%TMP_DF%%\nFilesystem 1B-blocks\n/dev/shm 8000000 100 7900000 1% /tmp'
    const s = parseProbeSections(raw)
    expect(s.VERSION).toContain('3.0.1')
    expect(s.TMP_DF).toContain('/tmp')
  })
})

describe('parseTmpFreeBytes', () => {
  it('reads available column from df -B1', () => {
    const out = parseTmpFreeBytes(`Filesystem     1B-blocks    Used Available Use% Mounted on
tmpfs           8000000000 1000000 7999000000   1% /tmp`)
    expect(out).toBe(7_999_000_000)
  })
})

describe('parseRamAvailableMb', () => {
  it('parses Mem available column', () => {
    const out = parseRamAvailableMb(`              total        used        free      shared  buff/cache   available
Mem:           32000        8000       20000         100        4000       23000`)
    expect(out).toBe(23_000)
  })
})

describe('evaluateNodeChecksFromProbe', () => {
  const base = {
    sanId: 'san-1',
    label: 'SAN1',
    readOnly: false,
    sshConnected: true,
    installed: { raw: '3.0.1', buildType: 'stable' as const, version: '3.0.1' },
    clusterEnabled: false,
  }

  it('blocks when /tmp below 5 GiB', () => {
    const avail = Math.floor(4 * 1024 ** 3)
    const checks = evaluateNodeChecksFromProbe({
      ...base,
      sections: {
        VERSION: '3.0.1',
        TMP_DF: `tmpfs ${avail + 1_000_000} 0 ${avail} 50% /tmp`,
        FREE_M: 'Mem: 8000 1000 6000 0 1000 5000',
        CONF_SYNC: '/usr/local/sbin/conf_sync.sh',
        BOOT: 'total 0',
        DRBD: 'DRBD_UNAVAILABLE',
        RAID_CLI: '',
      },
    })
    const tmp = checks.find(c => c.id === 'tmp_free_space')
    expect(tmp?.level).toBe('blocked')
    expect(tmp?.ok).toBe(false)
  })

  it('ready when space and ssh ok', () => {
    const avail = REQUIRED_TMP_BYTES + 2 * 1024 ** 3
    const checks = evaluateNodeChecksFromProbe({
      ...base,
      sections: {
        VERSION: '3.0.1',
        TMP_DF: `Filesystem     1B-blocks      Used Available Use% Mounted on\ntmpfs ${avail * 2} 0 ${avail} 1 /tmp`,
        TMP_MOUNT: 'tmpfs on /tmp type tmpfs',
        FREE_M: 'Mem: 16000 2000 12000 0 2000 12000',
        CONF_SYNC: '/usr/local/sbin/conf_sync.sh',
        BOOT: 'drwx',
        DRBD: '[]',
        RAID_CLI: '/usr/sbin/storcli64',
      },
    })
    expect(levelFromChecks(checks)).toBe('ready')
  })

  it('blocks read-only SAN', () => {
    const checks = evaluateNodeChecksFromProbe({
      ...base,
      readOnly: true,
      sections: { VERSION: '3.0.1', TMP_DF: '', FREE_M: '', CONF_SYNC: 'x', BOOT: '', DRBD: '', RAID_CLI: '' },
    })
    expect(checks.find(c => c.id === 'san_writable')?.ok).toBe(false)
  })
})

describe('aggregateOverallLevel', () => {
  it('picks worst level across nodes', () => {
    const nodes: UpgradeNodeReadiness[] = [
      { sanId: 'a', label: 'A', level: 'ready', checks: [], installed: { raw: '', buildType: 'unknown' } },
      { sanId: 'b', label: 'B', level: 'blocked', checks: [], installed: { raw: '', buildType: 'unknown' } },
    ]
    expect(aggregateOverallLevel(nodes)).toBe('blocked')
  })
})
