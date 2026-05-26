import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergeAdvancedBlockBackends } from '../server/utils/advanced-block-backends'
import { parseLsblkAdvancedJson } from '../server/utils/parsers/advanced-storage/lsblk-advanced.parser'
import { parseMultipathLl } from '../server/utils/parsers/advanced-storage/multipath.parser'
import { emptyDRBDStatus } from '../server/utils/parsers/drbd.parser'

const FIX = join(__dirname, 'fixtures/advanced-storage')

describe('mergeAdvancedBlockBackends', () => {
  it('classifies drbd and multipath paths from lsblk', () => {
    const lsblkRaw = readFileSync(join(FIX, 'lsblk-drbd.json'), 'utf8')
    const mpRaw = readFileSync(join(FIX, 'multipath-ll.txt'), 'utf8')
    const backends = mergeAdvancedBlockBackends({
      lsblkRows: parseLsblkAdvancedJson(lsblkRaw),
      drbd: {
        ...emptyDRBDStatus(),
        available: true,
        resources: [{
          name: 'r0',
          role: 'Primary',
          diskState: 'UpToDate',
          peerDiskState: 'UpToDate',
          connState: 'Connected',
          peerRole: 'Secondary',
          peerNode: 'node-b',
          syncPercent: 0,
          outOfSyncKB: 0,
          sizeBytes: 10737418240,
          writtenKB: 0,
          readKB: 0,
          etaSeconds: null,
          isSyncing: false,
          hasCriticalAlert: false,
        }],
      },
      multipathMaps: parseMultipathLl(mpRaw),
      bcacheDevices: [],
      dmTargets: [],
      lvmCacheVolumes: [],
      rbdMappings: [],
      zfsPools: [],
    })

    expect(backends.some(b => b.path === '/dev/drbd0' && b.kind === 'drbd')).toBe(true)
    expect(backends.some(b => b.path.includes('mpatha') && b.kind === 'multipath')).toBe(true)
  })
})
