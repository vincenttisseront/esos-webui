/**
 * Tests détection tableaux MD arrêtés / parsers examine & scan
 */
import { describe, expect, it } from 'vitest'
import { parseMdadmExamineOutput, parseMdadmExamineBulk } from '../server/utils/parsers/mdadm-examine.parser'
import { parseMdadmScanLines } from '../server/utils/parsers/mdadm-scan.parser'
import { detectStoppedMdArrays } from '../server/utils/stopped-md-arrays'
import type { MdArray, RaidBlockDevice } from '../server/utils/raid-types'

const SAMPLE_EXAMINE = `/dev/sdb1:
          Magic : a92b4efc
        Version : 1.2
    Feature Map : 0x1
     Array UUID : aaa11111:2222:3333:4444:555566667777
           Name : esos:0
  Raid Devices : 2
 Array Devices : 2
    Created Time : Mon Jan  1 00:00:00 2024
     Raid Level : raid1
   Device Size : 1046528
     Array Size : 1046528
   Used Dev Size : 1046528
    Raid Devices : 2
   Array Devices : 2
    Update Time : Mon Jan  1 00:00:00 2024
          State : clean
 Active Devices : 2
Working Devices : 2
 Failed Devices : 0
  Spare Devices : 0
`

describe('mdadm-examine parser', () => {
  it('parse un superblock MD valide', () => {
    const info = parseMdadmExamineOutput(SAMPLE_EXAMINE)
    expect(info?.uuid).toBe('aaa11111:2222:3333:4444:555566667777')
    expect(info?.name).toBe('esos:0')
    expect(info?.raidLevel).toBe('1')
    expect(info?.raidDevices).toBe(2)
  })

  it('ignore l\'absence de superblock', () => {
    expect(parseMdadmExamineOutput('No md superblock detected on /dev/sda1.')).toBeUndefined()
  })

  it('parse le format bulk overview', () => {
    const bulk = [
      '---DEVICE /dev/sdb1---',
      SAMPLE_EXAMINE,
      '---DEVICE /dev/sdc1---',
      SAMPLE_EXAMINE.replace('sdb1', 'sdc1'),
    ].join('\n')
    const map = parseMdadmExamineBulk(bulk)
    expect(map.size).toBe(2)
    expect(map.get('/dev/sdb1')?.uuid).toBe('aaa11111:2222:3333:4444:555566667777')
  })
})

describe('mdadm-scan parser', () => {
  it('parse les lignes ARRAY', () => {
    const lines = parseMdadmScanLines(
      'ARRAY /dev/md0 metadata=1.2 UUID=aaa11111:2222:3333:4444:555566667777 name=esos:0\n',
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.path).toBe('/dev/md0')
    expect(lines[0]?.name).toBe('md0')
    expect(lines[0]?.uuid).toBe('aaa11111:2222:3333:4444:555566667777')
  })
})

describe('detectStoppedMdArrays', () => {
  const activeMd: MdArray = {
    name: 'md1',
    path: '/dev/md1',
    uuid: 'bbbb:1111',
    raidLevel: '1',
    state: 'active',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    members: [],
    usedBy: [],
    warnings: [],
  }

  function part(path: string, uuid: string): RaidBlockDevice {
    return {
      name: path.replace('/dev/', ''),
      path,
      sizeBytes: 1,
      type: 'part',
      hasMdSuperblock: true,
      mdExamine: {
        uuid,
        name: 'esos:0',
        raidLevel: '1',
        raidDevices: 2,
      },
      mdEligibilityReasons: [],
      eligibleForMdPartitionPrep: false,
      mdPartitionPrepReasons: [],
      usedBy: ['md'],
      eligibleForMd: false,
      eligibleForHardwareRaid: false,
      warnings: [],
    }
  }

  it('groupe deux partitions par UUID', () => {
    const uuid = 'aaa11111:2222:3333:4444:555566667777'
    const stopped = detectStoppedMdArrays({
      mdadmScan: `ARRAY /dev/md0 metadata=1.2 UUID=${uuid} name=esos:0`,
      blockDevices: [part('/dev/sdb1', uuid), part('/dev/sdc1', uuid)],
      activeMdArrays: [],
    })
    expect(stopped).toHaveLength(1)
    expect(stopped[0]?.name).toBe('md0')
    expect(stopped[0]?.members).toHaveLength(2)
    expect(stopped[0]?.stoppedState).toBe('assemblable')
  })

  it('exclut les tableaux actifs', () => {
    const uuid = 'bbbb:1111'
    const stopped = detectStoppedMdArrays({
      mdadmScan: '',
      blockDevices: [part('/dev/sdb1', uuid)],
      activeMdArrays: [{ ...activeMd, uuid }],
    })
    expect(stopped).toHaveLength(0)
  })

  it('marque incomplete si membres insuffisants', () => {
    const uuid = 'ccc22222:3333:4444:5555:666677778888'
    const stopped = detectStoppedMdArrays({
      mdadmScan: `ARRAY /dev/md0 metadata=1.2 UUID=${uuid} name=esos:0`,
      blockDevices: [part('/dev/sdb1', uuid)],
      activeMdArrays: [],
    })
    expect(stopped[0]?.stoppedState).toBe('incomplete')
    expect(stopped[0]?.members.some(m => m.memberStatus === 'incomplete')).toBe(true)
    expect(stopped[0]?.members.some(m => m.memberStatus === 'member_missing')).toBe(true)
  })

  it('assigne md_superblock_detected aux membres assemblables', () => {
    const uuid = 'aaa11111:2222:3333:4444:555566667777'
    const stopped = detectStoppedMdArrays({
      mdadmScan: `ARRAY /dev/md0 metadata=1.2 UUID=${uuid} name=esos:0`,
      blockDevices: [part('/dev/sdb1', uuid), part('/dev/sdc1', uuid)],
      activeMdArrays: [],
    })
    expect(stopped[0]?.members.every(m => m.memberStatus === 'md_superblock_detected')).toBe(true)
  })
})
