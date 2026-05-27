/**
 * Tests unitaires RAID Management (SDD v3.12) — RAID01 à RAID15
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseMdstat } from '../server/utils/parsers/mdstat.parser'
import { parseMdadmDetail } from '../server/utils/parsers/mdadm-detail.parser'
import { buildStorCliCreateLd, buildMegaCliCreateLd, buildArcconfCreateLd } from '../server/utils/raid-hardware'
import { parseLspci, parseLsscsi, isRaidControllerPciLine } from '../server/utils/raid-pci-detection'
import { buildMdCreateCommand, normalizeAndAssertMdCreateRequest, validateMdCreateRequest } from '../server/utils/raid-md-validation'
import {
  buildMdAssembleCommand,
  createMdArray,
  createMdArrayFromPlan,
  expectedMdAssembleConfirmation,
  expectedMdZeroMetadataConfirmation,
  expectedMdZeroSuperblocksConfirmation,
  validateZeroSuperblockMembers,
  isMdadmAwaitingInteractiveConfirmation,
  isMdadmCreateCommandFailure,
  MDADM_INTERACTIVE_CONFIRM_MESSAGE,
  resolveMdCreateExecErrorMessage,
} from '../server/utils/raid-md-actions'
import { runPreflight } from '../server/utils/raid-preflight'
import type { StoppedMdArray } from '../server/utils/raid-types'
import { validatePrepareMdPartitionsRequest } from '../server/utils/raid-md-partition-actions'
import {
  buildAddMdMemberNodeResults,
  buildCreateMdArrayNodeResults,
  buildPrepareMdPartitionsNodePlans,
  duplicateManualMappingBlockers,
  mapDeviceToPeer,
  runClusterStoragePreflight,
  runNodePreflight,
} from '../server/utils/raid-cluster-storage-preflight'
import {
  buildMdAddDeviceCommand,
  expectedMdAddSpareConfirmation,
  validateMdAddDeviceRequest,
} from '../server/utils/raid-md-add-member-validation'
import { detectStoppedMdArrays } from '../server/utils/stopped-md-arrays'
import { derivePartitionMappingsFromDiskMappings, expectedFirstPartitionPath, filterPartitionMappingsForDevices } from '../utils/raid-cluster-mapping'

// ─── RAID01 – parseMdstat : tableau vide ─────────────────────────────────────
describe('RAID01 – parseMdstat: tableau vide', () => {
  it('retourne [] sur entrée vide', () => {
    expect(parseMdstat('')).toEqual([])
  })

  it('retourne [] si pas de md dans Personalities', () => {
    const input = 'Personalities : [linear] [multipath]\nunused devices: <none>'
    expect(parseMdstat(input)).toEqual([])
  })
})

// ─── RAID02 – parseMdstat : RAID1 actif ──────────────────────────────────────
describe('RAID02 – parseMdstat: RAID1 actif 2 devices', () => {
  const mdstatRaid1 = `Personalities : [raid1]
md0 : active raid1 sdb[1] sda[0]
      976773120 blocks super 1.2 [2/2] [UU]

unused devices: <none>`

  it('détecte md0', () => {
    const arrays = parseMdstat(mdstatRaid1)
    expect(arrays).toHaveLength(1)
    expect(arrays[0].name).toBe('md0')
    expect(arrays[0].path).toBe('/dev/md0')
  })

  it('niveau RAID correct', () => {
    const [arr] = parseMdstat(mdstatRaid1)
    expect(arr.raidLevel).toBe('1')
  })

  it('état actif', () => {
    const [arr] = parseMdstat(mdstatRaid1)
    expect(arr.state).toBe('active')
  })

  it('2 membres', () => {
    const [arr] = parseMdstat(mdstatRaid1)
    expect(arr.members).toHaveLength(2)
    expect(arr.members.map(m => m.path)).toContain('/dev/sda')
    expect(arr.members.map(m => m.path)).toContain('/dev/sdb')
  })

  it('raidDevices = 2', () => {
    const [arr] = parseMdstat(mdstatRaid1)
    expect(arr.raidDevices).toBe(2)
  })
})

// ─── RAID03 – parseMdstat : RAID5 en rebuild ─────────────────────────────────
describe('RAID03 – parseMdstat: RAID5 en recovery', () => {
  const mdstatRaid5Recovery = `Personalities : [raid5]
md1 : active raid5 sdc[2] sdb[1] sda[0]
      2929893888 blocks super 1.2 level 5, 512k chunk, algorithm 2 [3/2] [UU_]
      [=====>...............]  recovery = 27.3% (399424/1464946) finish=5.1min speed=3424K/sec

unused devices: <none>`

  it('état recovery', () => {
    const [arr] = parseMdstat(mdstatRaid5Recovery)
    expect(arr.state).toBe('recovering')
  })

  it('progress détecté', () => {
    const [arr] = parseMdstat(mdstatRaid5Recovery)
    expect(arr.progress).toBeTruthy()
    expect(arr.progress?.action).toBe('recovery')
    expect(arr.progress?.percent).toBeGreaterThan(0)
    expect(arr.progress?.percent).toBeLessThan(100)
  })

  it('chunk size 512K', () => {
    const [arr] = parseMdstat(mdstatRaid5Recovery)
    expect(arr.chunkKb).toBe(512)
  })
})

// ─── RAID04 – parseMdstat : device dégradé ───────────────────────────────────
describe('RAID04 – parseMdstat: RAID1 dégradé', () => {
  const mdstatDegraded = `Personalities : [raid1]
md0 : active (auto-read-only) raid1 sda[0]
      976773120 blocks super 1.2 [2/1] [U_]

unused devices: <none>`

  it('état degraded', () => {
    const [arr] = parseMdstat(mdstatDegraded)
    expect(arr.state).toBe('degraded')
  })
})

// ─── RAID05 – parseMdadmDetail ────────────────────────────────────────────────
describe('RAID05 – parseMdadmDetail: parsing basique', () => {
  const detail = `/dev/md0:
           Version : 1.2
     Creation Time : Thu Jan  1 00:00:00 2015
        Raid Level : raid1
        Array Size : 976773120 (931.51 GiB 1000.21 GB)
     Used Dev Size : 976773120 (931.51 GiB 1000.21 GB)
      Raid Devices : 2
     Total Devices : 2
       Persistence : Superblock is persistent

       Update Time : Mon May  5 10:00:00 2025
             State : clean
    Active Devices : 2
   Working Devices : 2
    Failed Devices : 0
     Spare Devices : 0

Consistency Policy : resync

              Name : esos:0 (local to host esos)
              UUID : 12345678:abcdef12:34567890:abcdef12
            Events : 42

    Number   Major   Minor   RaidDevice State
       0     252        1        0      active sync   /dev/sda
       1     252       17        1      active sync   /dev/sdb`

  it('parse UUID', () => {
    const result = parseMdadmDetail(detail)
    expect(result.uuid).toMatch(/12345678/)
  })

  it('parse state clean', () => {
    const result = parseMdadmDetail(detail)
    expect(result.state).toBe('clean')
  })

  it('parse 2 membres', () => {
    const result = parseMdadmDetail(detail)
    expect(result.members).toHaveLength(2)
  })

  it('membres avec path et state', () => {
    const result = parseMdadmDetail(detail)
    const sda = result.members.find(m => m.path === '/dev/sda')
    expect(sda).toBeTruthy()
    expect(sda?.state).toContain('active')
  })
})

describe('RAID05b – stopped MD arrays from mdadm --examine', () => {
  it('groups complete matching metadata as assemblable', () => {
    const arrays = detectStoppedMdArrays({
      mdadmScan: '',
      blockDevices: [
        stoppedMember('/dev/sdb1', { uuid: 'abcd', name: 'host:md0', raidLevel: '1', raidDevices: 2, events: 12 }),
        stoppedMember('/dev/sdc1', { uuid: 'abcd', name: 'host:md0', raidLevel: '1', raidDevices: 2, events: 12 }),
      ],
      activeMdArrays: [],
    })

    expect(arrays).toHaveLength(1)
    expect(arrays[0].stoppedState).toBe('assemblable')
    expect(arrays[0].name).toBe('md0')
    expect(arrays[0].raidDevices).toBe(2)
    expect(arrays[0].members.map(m => m.path)).toEqual(['/dev/sdb1', '/dev/sdc1'])
  })

  it('keeps partial metadata incomplete and avoids RAIDunknown display data', () => {
    const arrays = detectStoppedMdArrays({
      mdadmScan: '',
      blockDevices: [
        stoppedMember('/dev/sdb1', { uuid: 'abcd', name: 'host:md0', raidLevel: 'unknown', raidDevices: 2, events: 12 }),
      ],
      activeMdArrays: [],
    })

    expect(arrays).toHaveLength(1)
    expect(arrays[0].stoppedState).toBe('incomplete')
    expect(arrays[0].name).toBe('md0')
    expect(arrays[0].raidLevel).toBe('unknown')
  })

  it('keeps ungroupable metadata inspectable and excludes active members', () => {
    const arrays = detectStoppedMdArrays({
      mdadmScan: '',
      blockDevices: [
        stoppedMember('/dev/sdb1', { name: 'unknown', raidDevices: 2 }),
        stoppedMember('/dev/sdc1', { uuid: 'active', raidLevel: '1', raidDevices: 2 }),
      ],
      activeMdArrays: [{
        name: 'md1',
        path: '/dev/md1',
        uuid: 'active',
        raidLevel: '1',
        state: 'active',
        raidDevices: 2,
        activeDevices: 2,
        workingDevices: 2,
        failedDevices: 0,
        spareDevices: 0,
        members: [{ path: '/dev/sdc1', state: ['active', 'sync'] }],
        usedBy: [],
        warnings: [],
      }],
    })

    expect(arrays).toHaveLength(1)
    expect(arrays[0].name).toBe('unknown')
    expect(arrays[0].members.map(m => m.path)).toEqual(['/dev/sdb1', '—'])
    expect(arrays[0].members[0]?.memberStatus).toBe('orphan_metadata')
    expect(arrays[0].members[1]?.memberStatus).toBe('member_missing')
  })
})

function stoppedMember(path: string, mdExamine: Record<string, unknown>) {
  return {
    name: path.split('/').pop() ?? path,
    path,
    sizeBytes: 1024,
    type: 'part',
    hasMdSuperblock: true,
    mdExamine: {
      raw: `mdadm --examine ${path}`,
      ...mdExamine,
    },
    mdEligibilityReasons: [],
    eligibleForMdPartitionPrep: false,
    mdPartitionPrepReasons: [],
    usedBy: ['md'],
    eligibleForMd: false,
    eligibleForHardwareRaid: false,
    warnings: [],
  } as any
}

// ─── RAID06 – buildStorCliCreateLd ───────────────────────────────────────────
describe('RAID06 – buildStorCliCreateLd', () => {
  it('génère commande storcli RAID5', () => {
    const cmd = buildStorCliCreateLd('storcli', '0', '5', [
      { enclosure: '252', slot: '0' },
      { enclosure: '252', slot: '1' },
      { enclosure: '252', slot: '2' },
    ], 'WT', 'ADRA', 'storcli')
    expect(cmd).toContain('storcli')
    expect(cmd).toContain('type=raid5')
    expect(cmd).toContain('wt')
    expect(cmd).toContain('adra')
  })

  it('génère commande perccli RAID1 (syntaxe r1, sans cache)', () => {
    const cmd = buildStorCliCreateLd('/opt/MegaRAID/perccli/perccli64', '0', '1', [
      { enclosure: '32', slot: '6' },
      { enclosure: '32', slot: '7' },
    ], 'WT', 'ADRA', 'perccli')
    expect(cmd).toContain('perccli64')
    expect(cmd).toContain('/c0 add vd r1 drives=32:6,32:7')
    expect(cmd).not.toContain('type=raid')
    expect(cmd).not.toContain('adra')
    expect(cmd).not.toContain(' wt ')
  })
})

// ─── RAID07 – buildMegaCliCreateLd ───────────────────────────────────────────
describe('RAID07 – buildMegaCliCreateLd', () => {
  it('génère commande MegaCLI RAID6', () => {
    const cmd = buildMegaCliCreateLd('0', '6', [
      { enclosure: '8', slot: '0' },
      { enclosure: '8', slot: '1' },
      { enclosure: '8', slot: '2' },
      { enclosure: '8', slot: '3' },
    ], 'WT', 'RA')
    expect(cmd).toContain('MegaCli64')
    expect(cmd).toContain('-R6')
    expect(cmd).toContain('-a0')
  })
})

// ─── RAID08 – buildArcconfCreateLd ───────────────────────────────────────────
describe('RAID08 – buildArcconfCreateLd', () => {
  it('génère commande arcconf RAID10', () => {
    const cmd = buildArcconfCreateLd('1', '10', [
      { enclosure: '0', slot: '0' },
      { enclosure: '0', slot: '1' },
    ], 'WB', 'ADRA')
    expect(cmd).toContain('arcconf')
    expect(cmd).toContain('CREATE')
    expect(cmd).toContain('WB')
  })
})

// ─── RAID09 – parseMdstat : RAID10 ───────────────────────────────────────────
describe('RAID09 – parseMdstat: RAID10', () => {
  const mdstatRaid10 = `Personalities : [raid10]
md2 : active raid10 sdd[3] sdc[2] sdb[1] sda[0]
      1953513472 blocks super 1.2 512K chunks 2 near-copies [4/4] [UUUU]

unused devices: <none>`

  it('niveau RAID10', () => {
    const [arr] = parseMdstat(mdstatRaid10)
    expect(arr.raidLevel).toBe('10')
  })

  it('4 membres', () => {
    const [arr] = parseMdstat(mdstatRaid10)
    expect(arr.members).toHaveLength(4)
  })

  it('actif', () => {
    const [arr] = parseMdstat(mdstatRaid10)
    expect(arr.state).toBe('active')
  })
})

// ─── RAID10 – parseMdstat : multiple arrays ──────────────────────────────────
describe('RAID10 – parseMdstat: multiples arrays', () => {
  const multiMdstat = `Personalities : [raid1] [raid5]
md0 : active raid1 sdb[1] sda[0]
      976773120 blocks super 1.2 [2/2] [UU]

md1 : active raid5 sde[2] sdd[1] sdc[0]
      1953546240 blocks super 1.2 level 5, 512k chunk, algorithm 2 [3/3] [UUU]

unused devices: <none>`

  it('détecte 2 arrays', () => {
    const arrays = parseMdstat(multiMdstat)
    expect(arrays).toHaveLength(2)
  })

  it('noms corrects', () => {
    const arrays = parseMdstat(multiMdstat)
    const names = arrays.map(a => a.name)
    expect(names).toContain('md0')
    expect(names).toContain('md1')
  })
})

// ─── RAID11 – parseMdstat : RAID0 striping ───────────────────────────────────
describe('RAID11 – parseMdstat: RAID0', () => {
  const mdstatRaid0 = `Personalities : [raid0]
md0 : active raid0 sdb[1] sda[0]
      1953546240 blocks super 1.2 512k chunks

unused devices: <none>`

  it('niveau RAID0', () => {
    const [arr] = parseMdstat(mdstatRaid0)
    expect(arr.raidLevel).toBe('0')
  })

  it('activeDevices = raidDevices', () => {
    const [arr] = parseMdstat(mdstatRaid0)
    expect(arr.activeDevices).toBe(arr.raidDevices)
  })
})

// ─── RAID12 – isRaidControllerPciLine : filtrage par classe PCI ──────────────
describe('RAID12 – isRaidControllerPciLine: filtrage classe PCI', () => {
  const FIXTURE_LSPCI = [
    '02:00.0 RAID bus controller: LSI Logic / Symbios Logic MegaRAID SAS-3 3108 [Invader] (rev 02)',
    '07:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe Switch [PS]',
    '08:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe Switch [PS]',
    '09:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe-PCI Bridge [PPB]',
    '00:1f.3 SMBus: Intel Corporation C610/X99 series chipset SMBus (rev 05)',
    '00:14.0 USB controller: Intel Corporation C610/X99 series chipset USB xHCI Host Controller',
    '01:00.0 Ethernet controller: Intel Corporation Ethernet Controller X540-AT2 (rev 01)',
  ]

  it('accepte le contrôleur RAID bus controller LSI/MegaRAID', () => {
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[0]!)).toBe(true)
  })

  it('rejette le bridge Renesas SH7758 PCIe Switch', () => {
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[1]!)).toBe(false)
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[2]!)).toBe(false)
  })

  it('rejette le bridge Renesas SH7758 PCIe-PCI Bridge', () => {
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[3]!)).toBe(false)
  })

  it('rejette SMBus, USB controller, Ethernet controller', () => {
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[4]!)).toBe(false)
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[5]!)).toBe(false)
    expect(isRaidControllerPciLine(FIXTURE_LSPCI[6]!)).toBe(false)
  })
})

// ─── RAID13 – parseLspci : fixture Dell R730xd réelle ────────────────────────
describe('RAID13 – parseLspci: fixture Dell R730xd (avec faux positifs Renesas)', () => {
  const LSPCI_R730XD = [
    '02:00.0 RAID bus controller: LSI Logic / Symbios Logic MegaRAID SAS-3 3108 [Invader] (rev 02)',
    '07:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe Switch [PS]',
    '08:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe Switch [PS]',
    '09:00.0 PCI bridge: Renesas Technology Corp. SH7758 PCIe-PCI Bridge [PPB]',
    '00:1f.3 SMBus: Intel Corporation C610/X99 series chipset SMBus (rev 05)',
  ].join('\n')

  it("ne retourne qu'un seul contrôleur (pas de faux positifs Renesas)", () => {
    const controllers = parseLspci(LSPCI_R730XD)
    expect(controllers).toHaveLength(1)
  })

  it('le modèle contient MegaRAID SAS-3 3108', () => {
    const [ctrl] = parseLspci(LSPCI_R730XD)
    expect(ctrl!.model).toMatch(/MegaRAID SAS-3 3108/i)
  })

  it("l'adresse PCI est 02:00.0", () => {
    const [ctrl] = parseLspci(LSPCI_R730XD)
    expect(ctrl!.pciAddress).toBe('02:00.0')
  })

  it('le vendeur est lsi_megaraid ou dell_perc', () => {
    const [ctrl] = parseLspci(LSPCI_R730XD)
    expect(['lsi_megaraid', 'dell_perc']).toContain(ctrl!.vendor)
  })
})

// ─── RAID14 – parseLspci : fixture avec IDs PCI Dell PERC H730P Mini ─────────
describe('RAID14 – parseLspci: Dell PERC H730P Mini (IDs PCI [1000:005d] subsystem [1028:1f47])', () => {
  const LSPCI_WITH_IDS = [
    '02:00.0 RAID bus controller [0104]: LSI Logic / Symbios Logic MegaRAID SAS-3 3108 [Invader] [1000:005d] (rev 02)',
  ].join('\n')

  it('détecte un seul contrôleur', () => {
    expect(parseLspci(LSPCI_WITH_IDS)).toHaveLength(1)
  })

  it('extrait les IDs PCI', () => {
    const [ctrl] = parseLspci(LSPCI_WITH_IDS)
    expect(ctrl!.pciVendorId).toBe('1000')
    expect(ctrl!.pciDeviceId).toBe('005d')
  })
})

// ─── RAID15 – parseLsscsi : volumes DELL PERC ────────────────────────────────
describe('RAID15 – parseLsscsi: volumes logiques DELL PERC H730P Mini', () => {
  const LSSCSI_OUTPUT = [
    '[0:2:0:0]    disk    DELL     PERC H730P Mini  4.30  /dev/sda  /dev/sg0',
    '[0:2:1:0]    disk    DELL     PERC H730P Mini  4.30  /dev/sdb  /dev/sg1',
    '[0:0:0:0]    enclosu ATA      SAMSUNG          0001  -         /dev/sg2',
    '[1:0:0:0]    disk    ATA      ST2000NM0008     SN03  /dev/sdc  /dev/sg3',
  ].join('\n')

  it('retourne 2 volumes (les 2 disques PERC)', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives).toHaveLength(2)
  })

  it('exclut les périphériques non-RAID (ATA, enclosure)', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives.every(d => d.vendor.toUpperCase() === 'DELL')).toBe(true)
  })

  it('extrait les adresses SCSI correctement', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives.map(d => d.scsiAddress)).toEqual(['0:2:0:0', '0:2:1:0'])
  })

  it('extrait les chemins /dev/sda et /dev/sdb', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives.map(d => d.devicePath)).toEqual(['/dev/sda', '/dev/sdb'])
  })

  it('le modèle contient PERC H730P Mini', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives[0]!.model).toContain('PERC H730P Mini')
  })

  it('source est lsscsi', () => {
    const drives = parseLsscsi(LSSCSI_OUTPUT)
    expect(drives.every(d => d.source === 'lsscsi')).toBe(true)
  })
})

describe('RAID16 – parseMdadmDetail: membres removed/spare et metadata', () => {
  const detail = `/dev/md0:
           Version : 1.2
        Raid Level : raid5
     Raid Devices : 3
    Active Devices : 2
    Failed Devices : 1
     Spare Devices : 1
             State : clean, degraded, recovering
              Name : esos:0
              UUID : 12345678:abcdef12:34567890:abcdef12

    Number   Major   Minor   RaidDevice State
       0       8        1        0      active sync   /dev/sda1
       -       0        0        1      removed
       2       8       33        2      spare rebuilding   /dev/sdc1`

  it('parse la version metadata et le nom mdadm', () => {
    const result = parseMdadmDetail(detail)
    expect(result.metadataVersion).toBe('1.2')
    expect(result.name).toBe('esos:0')
  })

  it('représente les slots removed sans chemin device', () => {
    const result = parseMdadmDetail(detail)
    const removed = result.members.find(m => m.state.includes('removed'))
    expect(removed).toBeTruthy()
    expect(removed?.path).toBeUndefined()
    expect(removed?.raidDevice).toBe(1)
  })

  it('parse les membres spare en rebuild', () => {
    const result = parseMdadmDetail(detail)
    const spare = result.members.find(m => m.path === '/dev/sdc1')
    expect(spare?.state).toContain('spare')
    expect(spare?.state).toContain('rebuilding')
  })
})

describe('RAID17 – validation création MD stricte', () => {
  const baseDevice = {
    name: 'sda1',
    path: '/dev/sda1',
    sizeBytes: 1024 * 1024 * 1024,
    type: 'part' as const,
    partitionTypeCode: '0xfd',
    partitionTypeName: 'Linux RAID Autodetect',
    usedBy: [],
    eligibleForMd: true,
    eligibleForHardwareRaid: false,
    warnings: [],
    mdEligibilityReasons: [],
  }

  it('accepte des partitions Linux RAID Autodetect propres', () => {
    const result = validateMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
    }, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
    ], [])

    expect(result.blockers).toEqual([])
    expect(result.commandPreview).toBe('mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sda1 /dev/sdb1')
  })

  it('accepte les tailles de chunk MD proposées par le wizard', () => {
    for (const chunkKb of [16, 32, 64, 128, 256, 512, 1024]) {
      const result = validateMdCreateRequest({
        name: 'md0',
        level: '1',
        chunkKb,
        devices: ['/dev/sda1', '/dev/sdb1'],
      }, [
        baseDevice,
        { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
      ], [])

      expect(result.blockers).toEqual([])
      expect(result.commandPreview).toContain(`--chunk=${chunkKb}`)
    }
  })

  it('rejette les noms non numériques et les partitions sans type Linux RAID', () => {
    const result = validateMdCreateRequest({
      name: 'md_root',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
    }, [
      { ...baseDevice, partitionTypeCode: undefined, partitionTypeName: undefined, mdEligibilityReasons: ['Type de partition Linux RAID Autodetect requis'] },
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1', partitionTypeCode: undefined, partitionTypeName: undefined, mdEligibilityReasons: ['Type de partition Linux RAID Autodetect requis'] },
    ], [])

    expect(result.blockers).toContain('Le nom du tableau doit être numérique, par exemple md0 ou md1')
    expect(result.blockers.some(b => b.includes('Linux RAID Autodetect'))).toBe(true)
  })

  it('rejette RAID10 avec un nombre impair de partitions', () => {
    const result = validateMdCreateRequest({
      name: 'md10',
      level: '10',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1', '/dev/sdc1'],
    }, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
      { ...baseDevice, name: 'sdc1', path: '/dev/sdc1' },
    ], [])

    expect(result.blockers).toContain('RAID10 requiert un nombre pair de partitions')
  })

  it('expose blockerRefs pour collision md0 block device', () => {
    const result = validateMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
    }, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
    ], [], { sanId: 'san-esos2' })

    const withMdDevice = validateMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
    }, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
      {
        name: 'md0',
        path: '/dev/md0',
        sizeBytes: 1,
        type: 'raid' as const,
        usedBy: [],
        eligibleForMd: false,
        eligibleForHardwareRaid: false,
        mdEligibilityReasons: [],
        eligibleForMdPartitionPrep: false,
        mdPartitionPrepReasons: [],
        warnings: [],
      },
    ], [], { sanId: 'san-esos2' })

    expect(result.blockerRefs).toEqual([])
    expect(withMdDevice.blockers.some(b => b.includes('/dev/md0'))).toBe(true)
    expect(withMdDevice.blockerRefs?.some(r => r.code === 'md_block_device_exists' && r.sanId === 'san-esos2')).toBe(true)
  })

  it('rejette devices absent ou non-liste avant génération de commande', () => {
    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: undefined as any,
      confirmation: 'CREATE md0',
    }, [], [])).toThrow(/devices doit être une liste/)

    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: '/dev/sda1' as any,
      confirmation: 'CREATE md0',
    }, [], [])).toThrow(/devices doit être une liste/)
  })

  it('rejette un raidDevices fourni mais incohérent avec les membres', () => {
    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
      raidDevices: 3,
      confirmation: 'CREATE md0',
    } as any, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
    ], [])).toThrow(/raidDevices .* ne correspond pas/)

    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
      raidDevices: '',
      confirmation: 'CREATE md0',
    } as any, [
      baseDevice,
      { ...baseDevice, name: 'sdb1', path: '/dev/sdb1' },
    ], [])).toThrow(/raidDevices .* ne correspond pas/)
  })

  it('applique les minimums par niveau RAID côté serveur', () => {
    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md5',
      level: '5',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
      confirmation: 'CREATE md5',
    }, [], [])).toThrow(/RAID5 requiert au minimum 3/)

    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md6',
      level: '6',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1', '/dev/sdc1'],
      confirmation: 'CREATE md6',
    }, [], [])).toThrow(/RAID6 requiert au minimum 4/)
  })

  it('rejette nom, niveau et chunk invalides côté serveur', () => {
    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'raid0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
      confirmation: 'CREATE raid0',
    }, [], [])).toThrow(/nom du tableau doit être numérique|Nom d'array invalide/)

    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '2' as any,
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
      confirmation: 'CREATE md0',
    }, [], [])).toThrow(/Niveau RAID invalide/)

    expect(() => normalizeAndAssertMdCreateRequest({
      name: 'md0',
      level: '1',
      chunkKb: 65,
      devices: ['/dev/sda1', '/dev/sdb1'],
      confirmation: 'CREATE md0',
    }, [], [])).toThrow(/Taille de chunk invalide/)
  })
})

describe('RAID18 – buildMdCreateCommand', () => {
  it('génère la commande RAID1 attendue avec le nombre de membres dérivé', () => {
    const command = buildMdCreateCommand({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sdb1', '/dev/sdc1'],
    })

    expect(command).toBe('mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1')
  })

  it('génère uniquement la commande mdadm de base documentée', () => {
    const command = buildMdCreateCommand({
      name: 'md0',
      level: '0',
      chunkKb: 64,
      devices: ['/dev/sda1', '/dev/sdb1'],
    })

    expect(command).toBe('mdadm --create /dev/md0 --chunk=64 --level=0 --raid-devices=2 --run /dev/sda1 /dev/sdb1')
    expect(command).toContain('--run')
    expect(command).not.toContain('--force')
    expect(command).not.toContain('--assume-clean')
    expect(command).not.toContain('--metadata')
    expect(command).not.toContain('zero-superblock')
  })

  it('rejette une commande sans membres ou avec membres invalides', () => {
    expect(() => buildMdCreateCommand({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: [],
    })).toThrow(/Commande MD invalide : aucune partition membre transmise\./)

    expect(() => buildMdCreateCommand({
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sda1', ''],
    })).toThrow(/Chemin device invalide/)
  })

  it('ne lance pas SSH si la validation finale échoue avant mdadm', async () => {
    const manager = { exec: vi.fn() }

    await expect(createMdArray(manager as any, {
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: [],
      confirmation: 'CREATE md0',
    })).rejects.toThrow(/Commande MD invalide : aucune partition membre transmise\./)

    expect(manager.exec).not.toHaveBeenCalled()
  })

  it("exécute exactement la commande preview validée lorsqu'elle correspond au plan", async () => {
    const command = 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1'
    const manager = {
      exec: vi.fn()
        .mockResolvedValueOnce({ stdout: 'mdadm ok\nEXIT_CODE=0' })
        .mockResolvedValueOnce({ stdout: 'PERSIST_OK' }),
    }

    const result = await createMdArrayFromPlan(manager as any, {
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sdb1', '/dev/sdc1'],
      confirmation: 'CREATE md0',
    }, command)

    expect(result.command).toBe(command)
    expect(manager.exec).toHaveBeenCalledWith(`${command} 2>&1; echo EXIT_CODE=$?`, 120_000)
  })

  it('rejette une commande preview différente de la commande reconstruite avant SSH', async () => {
    const manager = { exec: vi.fn() }

    await expect(createMdArrayFromPlan(manager as any, {
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sdb1', '/dev/sdc1'],
      confirmation: 'CREATE md0',
    }, 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=')).rejects.toThrow(/Commande MD planifiée différente|nombre de membres incohérent/)

    expect(manager.exec).not.toHaveBeenCalled()
  })

  it("retourne la commande finale validée lorsqu'un exec SSH échoue", async () => {
    const command = 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1'
    const sshError = Object.assign(new Error(`SSH exec timeout (120000ms): ${command} 2>&1; echo EXIT_CODE=$?`), {
      stdout: 'mdadm partial output',
      stderr: 'timeout warning',
    })
    const manager = {
      exec: vi.fn().mockRejectedValueOnce(sshError),
    }

    try {
      await createMdArrayFromPlan(manager as any, {
        name: 'md0',
        level: '1',
        chunkKb: 64,
        devices: ['/dev/sdb1', '/dev/sdc1'],
        confirmation: 'CREATE md0',
      }, command)
      throw new Error('createMdArrayFromPlan should have failed')
    } catch (err: any) {
      expect(err.statusMessage).toBe(`SSH exec timeout (120000ms): ${command}`)
      expect(err.data.command).toBe(command)
      expect(err.data.command).not.toMatch(/--raid-devices=(?:\s|$)/)
      expect(err.data.stdout).toBe('mdadm partial output')
      expect(err.data.stderr).toBe('timeout warning')
    }
  })

  it('détecte la confirmation interactive mdadm dans stdout', async () => {
    const command = 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1'
    const sshError = Object.assign(new Error('SSH exec timeout (120000ms): mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices='), {
      stdout: 'mdadm: Note: this array has metadata at the start\nContinue creating array?',
      stderr: '',
    })
    const manager = {
      exec: vi.fn().mockRejectedValueOnce(sshError),
    }

    try {
      await createMdArrayFromPlan(manager as any, {
        name: 'md0',
        level: '1',
        chunkKb: 64,
        devices: ['/dev/sdb1', '/dev/sdc1'],
        confirmation: 'CREATE md0',
      }, command)
      throw new Error('createMdArrayFromPlan should have failed')
    } catch (err: any) {
      expect(err.statusMessage).toBe(MDADM_INTERACTIVE_CONFIRM_MESSAGE)
      expect(err.data.command).toBe(command)
    }
  })
})

describe('RAID18c – erreurs exec mdadm', () => {
  it('détecte le prompt interactif mdadm', () => {
    expect(isMdadmAwaitingInteractiveConfirmation('Continue creating array?', undefined)).toBe(true)
    expect(isMdadmAwaitingInteractiveConfirmation(undefined, 'no prompt here')).toBe(false)
  })

  it('résout le message interactif avant le message de timeout', () => {
    const command = 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1'
    const err = new Error('SSH exec timeout (120000ms): mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=')
    expect(resolveMdCreateExecErrorMessage(
      err,
      command,
      'Continue creating array?',
      undefined,
    )).toBe(MDADM_INTERACTIVE_CONFIRM_MESSAGE)
  })

  it('résout le timeout avec la commande finale complète', () => {
    const command = 'mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1'
    const err = new Error('SSH exec timeout (120000ms): mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=')
    expect(resolveMdCreateExecErrorMessage(err, command, 'partial output', undefined))
      .toBe(`SSH exec timeout (120000ms): ${command}`)
  })

  it('n\'interprète pas la resync comme un échec mdadm', () => {
    expect(isMdadmCreateCommandFailure('mdadm: array started\nresync = 12.3%\nEXIT_CODE=0')).toBe(false)
  })

  it('détecte EXIT_CODE non nul comme échec mdadm', () => {
    expect(isMdadmCreateCommandFailure('mdadm: error message\nEXIT_CODE=1')).toBe(true)
  })
})

describe('RAID18b – payload frontend création MD', () => {
  it('soumet les partitions sélectionnées sous la propriété devices', () => {
    const source = readFileSync(new URL('../components/raid/CreateMdArrayWizard.vue', import.meta.url), 'utf8')

    expect(source).toContain('const selectedDevices = [...form.devices]')
    expect(source).toContain('devices: selectedDevices')
    expect(source).toContain('await raid.planCreateMdArray')
  })

  it("réinitialise l'état d'exécution obsolète entre tentatives", () => {
    const source = readFileSync(new URL('../components/raid/CreateMdArrayWizard.vue', import.meta.url), 'utf8')

    expect(source).toContain('const executionAttemptId = ref(0)')
    expect(source).toContain('const executionStartedAt = ref<Date | null>(null)')
    expect(source).toContain('function resetExecutionState()')
    expect(source).toContain('function resetPlanAndExecutionState()')
    expect(source).toContain('function executionPlanSignature')
    expect(source).toContain("t('raid.wizard.attempt_started'")
    expect(source).toContain('formatAttemptStarted(executionStartedAt)')
    expect(source).toContain('executionNodeResults.value = result.clusterExecution.nodeResults')
  })

  it("affiche la commande de la tentative courante plutôt qu'une commande extraite d'une erreur", () => {
    const source = readFileSync(new URL('../components/raid/CreateMdArrayWizard.vue', import.meta.url), 'utf8')
    const endpoint = readFileSync(new URL('../server/api/raid/software/arrays.post.ts', import.meta.url), 'utf8')

    expect(source).toContain("t('raid.wizard.attempt_started'")
    expect(source).toContain('function executionCommandForNode')
    expect(source).toContain('submitError && !executionNodeResults.length')
    expect(source).toContain('command: typeof errorData.command === \'string\' ? errorData.command : executionCommandForNode(node)')
    expect(endpoint).toContain('data: err.data')
    expect(endpoint).toContain('node.command = typeof errorData.command === \'string\' ? errorData.command : node.command')
    expect(endpoint).toContain('traceMdCreateNodeFailure')
  })

  it('affiche une étape Terminé et diffère la fermeture du modal', () => {
    const source = readFileSync(new URL('../components/raid/CreateMdArrayWizard.vue', import.meta.url), 'utf8')
    const submitBlock = source.slice(source.indexOf('async function submit'), source.indexOf('function resetExecutionState'))

    expect(source).toContain("t('raid.wizard.steps.create_done')")
    expect(source).toContain('v-else-if="step === 4"')
    expect(source).toContain('function finishViewArray')
    expect(source).toContain('function finishClose')
    expect(source).toContain('step.value = 4')
    expect(submitBlock).not.toContain("emit('confirm'")
    expect(source).toContain("buildConfirmPayload('view-array')")
  })

  it('route vers le tableau MD après confirmation du wizard', () => {
    const source = readFileSync(new URL('../pages/admin/sans/[id]/raid.vue', import.meta.url), 'utf8')

    expect(source).toContain('isMdCreateConfirmPayload')
    expect(source).toContain("activeTab.value = 'software'")
    expect(source).toContain('highlightedArrayPath')
    expect(source).toContain('md-array-${arr.name}')
  })
})

describe('RAID19 – préparation partitions MD', () => {
  const tools = {
    mdadm: true,
    lspci: true,
    storcli: false,
    perccli: false,
    MegaCli64: false,
    arcconf: false,
    lsscsi: true,
    wipefs: true,
    parted: true,
    sfdisk: true,
    fdisk: true,
    partprobe: true,
    udevadm: true,
  }

  const cleanDisk = {
    name: 'sda',
    path: '/dev/sda',
    sizeBytes: 10 * 1024 * 1024 * 1024,
    type: 'disk' as const,
    usedBy: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: true,
    eligibleForMdPartitionPrep: true,
    mdPartitionPrepReasons: [],
    mdEligibilityReasons: ['Seules les partitions existantes sont éligibles'],
    childrenPaths: [],
    diskSignatures: [],
    warnings: [],
  }

  it('prépare un disque propre avec GPT/parted par défaut', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'auto',
      allowOverwriteSignatures: false,
    }, [cleanDisk], tools)

    expect(result.blockers).toEqual([])
    expect(result.partitionTableRequested).toBe('auto')
    expect(result.partitionTableResolved).toBe('gpt')
    expect(result.preparedPartitionPreview).toEqual([{ disk: '/dev/sda', expectedPartitionPath: '/dev/sda1' }])
    expect(result.commandPreview).toContain('parted -s /dev/sda mklabel gpt')
    expect(result.commandPreview).toContain('parted -s /dev/sda set 1 raid on')
    expect(result.commandPreview).not.toContain('mdadm --create')
    expect(result.commandPreview).not.toContain('zero-superblock')
    expect(result.commandPreview).not.toContain('wipefs')
  })

  it('utilise sfdisk type fd quand la stratégie dos est demandée', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'dos',
      allowOverwriteSignatures: false,
    }, [cleanDisk], tools)

    expect(result.blockers).toEqual([])
    expect(result.partitionTableRequested).toBe('dos')
    expect(result.partitionTableResolved).toBe('dos')
    expect(result.commandPreview).toContain("printf 'label: dos\\n, , fd\\n' | sfdisk /dev/sda")
  })

  it('utilise GPT explicitement quand la stratégie gpt est demandée', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'gpt',
      allowOverwriteSignatures: false,
    }, [cleanDisk], tools)

    expect(result.blockers).toEqual([])
    expect(result.partitionTableRequested).toBe('gpt')
    expect(result.partitionTableResolved).toBe('gpt')
    expect(result.commandPreview).toContain('parted -s /dev/sda mklabel gpt')
  })

  it('résout auto vers dos quand parted est absent et sfdisk présent', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'auto',
      allowOverwriteSignatures: false,
    }, [cleanDisk], { ...tools, parted: false, sfdisk: true })

    expect(result.blockers).toEqual([])
    expect(result.partitionTableRequested).toBe('auto')
    expect(result.partitionTableResolved).toBe('dos')
    expect(result.commandPreview).toContain("printf 'label: dos\\n, , fd\\n' | sfdisk /dev/sda")
  })

  it('bloque les signatures sans autorisation destructive', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'auto',
      allowOverwriteSignatures: false,
    }, [{ ...cleanDisk, diskSignatures: ['gpt'] }], tools)

    expect(result.blockers.some(b => b.includes('confirmation destructive'))).toBe(true)
  })

  it('autorise les signatures non critiques avec confirmation destructive', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'auto',
      allowOverwriteSignatures: true,
    }, [{ ...cleanDisk, diskSignatures: ['gpt'], childrenPaths: ['/dev/sda1'] }], tools)

    expect(result.blockers).toEqual([])
    expect(result.warnings.some(w => w.includes('seront remplacées'))).toBe(true)
  })

  it('bloque les usages critiques même avec confirmation destructive', () => {
    const result = validatePrepareMdPartitionsRequest({
      disks: ['/dev/sda'],
      partitionTable: 'auto',
      allowOverwriteSignatures: true,
    }, [{ ...cleanDisk, usedBy: ['lvm' as const], eligibleForMdPartitionPrep: false, mdPartitionPrepReasons: ['PV LVM détecté'] }], tools)

    expect(result.blockers.some(b => b.includes('PV LVM'))).toBe(true)
  })
})

describe('RAID20 – préflight stockage cluster', () => {
  const disk = (path: string, sizeBytes = 10_000, extra: Record<string, unknown> = {}) => ({
    name: path.replace('/dev/', ''),
    path,
    sizeBytes,
    type: 'disk',
    model: 'VMware Virtual disk',
    vendor: 'VMware',
    transport: 'scsi',
    rotational: false,
    usedBy: [],
    eligibleForMd: false,
    eligibleForHardwareRaid: false,
    eligibleForMdPartitionPrep: true,
    mdEligibilityReasons: ['Seules les partitions existantes sont éligibles'],
    mdPartitionPrepReasons: [],
    warnings: [],
    childrenPaths: [],
    diskSignatures: [],
    ...extra,
  })

  const inventory = (sanId: string, blockDevices: any[]) => ({
    sanId,
    label: sanId,
    role: sanId === 'primary' ? 'primary' : 'secondary',
    readOnly: false,
    sshReady: true,
    tools: {
      mdadm: true,
      lspci: true,
      storcli: false,
      perccli: false,
      MegaCli64: false,
      arcconf: false,
      lsscsi: true,
      wipefs: true,
      parted: true,
      sfdisk: true,
      fdisk: true,
      partprobe: true,
      udevadm: true,
    },
    blockDevices,
    mdArrays: [],
  })

  it('associe automatiquement les disques par identifiant stable', () => {
    const source = inventory('primary', [disk('/dev/sdb', 10_000, { idSerial: 'disk-123', byIdPaths: ['/dev/disk/by-id/scsi-disk-123'] })])
    const peer = inventory('secondary', [disk('/dev/sdc', 10_000, { idSerial: 'disk-123', byIdPaths: ['/dev/disk/by-id/scsi-disk-123'] })])

    const mapping = mapDeviceToPeer('/dev/sdb', source, peer, 'prepare_md_partitions')

    expect(mapping.targetPath).toBe('/dev/sdc')
    expect(mapping.confidence).toBe('high')
    expect(mapping.blockers).toEqual([])
  })

  it('associe par forme avec confiance moyenne quand les identifiants stables manquent', () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [disk('/dev/sdc', 20_000)])

    const mapping = mapDeviceToPeer('/dev/sdb', source, peer, 'prepare_md_partitions')

    expect(mapping.targetPath).toBe('/dev/sdc')
    expect(mapping.confidence).toBe('medium')
  })

  it('bloque les disques VMware ambigus de même taille sans mapping manuel', () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [disk('/dev/sdc', 20_000), disk('/dev/sdd', 20_000)])

    const mapping = mapDeviceToPeer('/dev/sdb', source, peer, 'prepare_md_partitions')

    expect(mapping.confidence).toBe('none')
    expect(mapping.blockers.some(b => b.includes('mapping ambigu'))).toBe(true)
    expect(mapping.candidates?.map(c => c.path)).toEqual(['/dev/sdc', '/dev/sdd'])
  })

  it('résout un mapping ambigu avec un mapping manuel explicite', () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [disk('/dev/sdc', 20_000), disk('/dev/sdd', 20_000)])

    const mapping = mapDeviceToPeer('/dev/sdb', source, peer, 'prepare_md_partitions', [{
      sourcePath: '/dev/sdb',
      targetSanId: 'secondary',
      targetPath: '/dev/sdd',
    }])

    expect(mapping.targetPath).toBe('/dev/sdd')
    expect(mapping.confidence).toBe('low')
    expect(mapping.blockers).toEqual([])
    expect(mapping.warnings.some(w => w.includes('Mapping manuel'))).toBe(true)
  })

  it('bloque les mappings manuels dupliqués vers le même disque pair', () => {
    const blockers = duplicateManualMappingBlockers([
      { sourcePath: '/dev/sdb', targetSanId: 'secondary', targetPath: '/dev/sdc' },
      { sourcePath: '/dev/sdc', targetSanId: 'secondary', targetPath: '/dev/sdc' },
    ])

    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('Mapping manuel dupliqué')
  })

  it('bloque un mapping manuel vers un device pair du mauvais type', () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [{ ...disk('/dev/sdc1', 20_000), type: 'part' }])

    const mapping = mapDeviceToPeer('/dev/sdb', source, peer, 'prepare_md_partitions', [{
      sourcePath: '/dev/sdb',
      targetSanId: 'secondary',
      targetPath: '/dev/sdc1',
    }])

    expect(mapping.confidence).toBe('none')
    expect(mapping.blockers.some(b => b.includes('type incompatible'))).toBe(true)
  })

  it('propage explicitement action=prepare_md_partitions au préflight local', async () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])

    const result = await runNodePreflight('prepare_md_partitions', {
      disks: ['/dev/sdb'],
      partitionTable: 'gpt',
      allowOverwriteSignatures: false,
    }, source)

    expect(result.riskLevel).toBe('destructive')
    expect(result.diskChecks?.[0]?.path).toBe('/dev/sdb')
    expect(result.commandPreview).toContain('parted -s /dev/sdb mklabel gpt')
  })

  it('construit un plan multi-nœud avec chemins pairs remappés', async () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [disk('/dev/sdc', 20_000)])
    const payload = {
      disks: ['/dev/sdb'],
      partitionTable: 'gpt' as const,
      allowOverwriteSignatures: false,
    }
    const primaryPreflight = await runNodePreflight('prepare_md_partitions', payload, source)
    const peerPayload = { ...payload, disks: ['/dev/sdc'] }
    const peerPreflight = await runNodePreflight('prepare_md_partitions', peerPayload, peer)

    const plans = buildPrepareMdPartitionsNodePlans({
      ok: true,
      action: 'prepare_md_partitions',
      sourceSanId: 'primary',
      blockers: [],
      warnings: [],
      syncLimitations: [],
      nodes: [source, peer],
      mappings: [{
        sourcePath: '/dev/sdb',
        targetSanId: 'secondary',
        targetPath: '/dev/sdc',
        confidence: 'medium',
        evidence: ['taille/modèle/vendor/transport compatibles'],
        warnings: [],
        blockers: [],
      }],
      perNodePreflights: {
        primary: primaryPreflight,
        secondary: peerPreflight,
      },
      executionModesAllowed: ['all_nodes'],
    }, {
      ...payload,
      confirmation: 'CREATE RAID PARTITIONS',
      clusterExecution: {
        primarySanId: 'primary',
        requirePreflightOk: true,
      },
    })

    expect(plans.map(plan => plan.sanId)).toEqual(['primary', 'secondary'])
    expect(plans[0]?.commands.join('\n')).toContain('/dev/sdb')
    expect(plans[1]?.disks).toEqual(['/dev/sdc'])
    expect(plans[1]?.commands.join('\n')).toContain('/dev/sdc')
    expect(plans[1]?.commands.join('\n')).not.toContain('/dev/sdb')
  })

  it('bloque un plan multi-nœud si un mapping pair reste manquant', async () => {
    const source = inventory('primary', [disk('/dev/sdb', 20_000)])
    const peer = inventory('secondary', [disk('/dev/sdc', 20_000)])
    const payload = {
      disks: ['/dev/sdb'],
      partitionTable: 'gpt' as const,
      allowOverwriteSignatures: false,
    }
    const primaryPreflight = await runNodePreflight('prepare_md_partitions', payload, source)

    expect(() => buildPrepareMdPartitionsNodePlans({
      ok: true,
      action: 'prepare_md_partitions',
      sourceSanId: 'primary',
      blockers: [],
      warnings: [],
      syncLimitations: [],
      nodes: [source, peer],
      mappings: [{
        sourcePath: '/dev/sdb',
        targetSanId: 'secondary',
        confidence: 'none',
        evidence: [],
        warnings: [],
        blockers: ['mapping ambigu pour /dev/sdb'],
      }],
      perNodePreflights: {
        primary: primaryPreflight,
      },
      executionModesAllowed: [],
    }, {
      ...payload,
      confirmation: 'CREATE RAID PARTITIONS',
      clusterExecution: {
        primarySanId: 'primary',
        requirePreflightOk: true,
      },
    })).toThrow(/mapping manquant|Plan multi-nœud incomplet/)
  })

  it('propage explicitement action=create_md au préflight local', async () => {
    const member = {
      ...disk('/dev/sdb1', 20_000),
      type: 'part',
      partitionTypeCode: '0xfd',
      partitionTypeName: 'Linux RAID Autodetect',
      eligibleForMd: true,
      mdEligibilityReasons: [],
    }
    const source = inventory('primary', [
      member,
      { ...member, name: 'sdc1', path: '/dev/sdc1' },
    ])

    const result = await runNodePreflight('create_md', {
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: ['/dev/sdb1', '/dev/sdc1'],
    }, source)

    expect(result.riskLevel).toBe('risky')
    expect(result.candidateChecks?.map(c => c.path)).toEqual(['/dev/sdb1', '/dev/sdc1'])
    expect(result.commandPreview).toContain('mdadm --create /dev/md0')
  })

  it('dérive les mappings de partitions depuis les mappings de disques', () => {
    expect(expectedFirstPartitionPath('/dev/sdb')).toBe('/dev/sdb1')
    expect(expectedFirstPartitionPath('/dev/nvme0n1')).toBe('/dev/nvme0n1p1')
    expect(expectedFirstPartitionPath('/dev/mmcblk0')).toBe('/dev/mmcblk0p1')

    expect(derivePartitionMappingsFromDiskMappings([
      { sourcePath: '/dev/sdb', targetSanId: 'secondary', targetPath: '/dev/sdc' },
      { sourcePath: '/dev/nvme0n1', targetSanId: 'secondary', targetPath: '/dev/nvme1n1' },
    ])).toEqual([
      { sourcePath: '/dev/sdb1', targetSanId: 'secondary', targetPath: '/dev/sdc1', confirmedBy: 'derived_from_operator_disk_mapping', sourceKind: 'partition' },
      { sourcePath: '/dev/nvme0n1p1', targetSanId: 'secondary', targetPath: '/dev/nvme1n1p1', confirmedBy: 'derived_from_operator_disk_mapping', sourceKind: 'partition' },
    ])
  })

  it('filtre les mappings de partitions préparées selon les membres MD sélectionnés', () => {
    const mappings = filterPartitionMappingsForDevices({
      sourceSanId: 'primary',
      clusterId: 'cluster-a',
      createdAt: 1,
      diskMappings: [],
      partitionMappings: [
        { sourcePath: '/dev/sdb1', targetSanId: 'secondary', targetPath: '/dev/sdd1' },
        { sourcePath: '/dev/sdc1', targetSanId: 'secondary', targetPath: '/dev/sde1' },
      ],
      sourceDisks: ['/dev/sdb', '/dev/sdc'],
      sourcePartitions: ['/dev/sdb1', '/dev/sdc1'],
    }, ['/dev/sdc1'])

    expect(mappings).toEqual([
      { sourcePath: '/dev/sdc1', targetSanId: 'secondary', targetPath: '/dev/sde1' },
    ])
  })

  it('réutilise un mapping explicite de partition pour create_md sans ambiguïté', () => {
    const member = {
      ...disk('/dev/sdb1', 20_000),
      type: 'part',
      partitionTypeCode: '0xfd',
      partitionTypeName: 'Linux RAID Autodetect',
      eligibleForMd: true,
      mdEligibilityReasons: [],
    }
    const source = inventory('primary', [member])
    const peer = inventory('secondary', [
      { ...member, name: 'sdd1', path: '/dev/sdd1' },
      { ...member, name: 'sde1', path: '/dev/sde1' },
    ])

    const mapping = mapDeviceToPeer('/dev/sdb1', source, peer, 'create_md', [{
      sourcePath: '/dev/sdb1',
      targetSanId: 'secondary',
      targetPath: '/dev/sde1',
    }])

    expect(mapping.targetPath).toBe('/dev/sde1')
    expect(mapping.confidence).toBe('low')
    expect(mapping.blockers).toEqual([])
  })

  it('traite un mapping de partition hérité comme confirmé par opérateur', () => {
    const member = {
      ...disk('/dev/sdb1', 20_000),
      type: 'part',
      partitionTypeCode: '0xfd',
      partitionTypeName: 'Linux RAID Autodetect',
      eligibleForMd: true,
      mdEligibilityReasons: [],
    }
    const source = inventory('primary', [member])
    const peer = inventory('secondary', [
      { ...member, name: 'sdd1', path: '/dev/sdd1' },
      { ...member, name: 'sde1', path: '/dev/sde1' },
    ])

    const mapping = mapDeviceToPeer('/dev/sdb1', source, peer, 'create_md', [{
      sourcePath: '/dev/sdb1',
      targetSanId: 'secondary',
      targetPath: '/dev/sde1',
      confirmedBy: 'derived_from_operator_disk_mapping',
      sourceKind: 'partition',
    }])

    expect(mapping.targetPath).toBe('/dev/sde1')
    expect(mapping.confidence).toBe('high')
    expect(mapping.warnings).toEqual([])
    expect(mapping.evidence.join(' ')).toContain('opérateur')
  })

  it('construit un plan create_md multi-nœud avec mapping de partitions hérité', async () => {
    const member = {
      ...disk('/dev/sdb1', 20_000),
      type: 'part',
      partitionTypeCode: '0xfd',
      partitionTypeName: 'Linux RAID Autodetect',
      eligibleForMd: true,
      mdEligibilityReasons: [],
    }
    const source = inventory('primary', [
      member,
      { ...member, name: 'sdc1', path: '/dev/sdc1' },
    ])
    const peer = inventory('secondary', [
      { ...member, name: 'sdd1', path: '/dev/sdd1' },
      { ...member, name: 'sde1', path: '/dev/sde1' },
    ])
    const payload = {
      name: 'md0',
      level: '1' as const,
      chunkKb: 64,
      devices: ['/dev/sdb1', '/dev/sdc1'],
    }
    const sourcePreflight = await runNodePreflight('create_md', payload, source)
    const peerPreflight = await runNodePreflight('create_md', {
      ...payload,
      devices: ['/dev/sdd1', '/dev/sde1'],
    }, peer)

    const plans = buildCreateMdArrayNodeResults({
      ok: true,
      action: 'create_md',
      sourceSanId: 'primary',
      blockers: [],
      warnings: [],
      syncLimitations: [],
      nodes: [source, peer],
      mappings: [
        { sourcePath: '/dev/sdb1', targetSanId: 'secondary', targetPath: '/dev/sdd1', confidence: 'high', evidence: ['mapping confirmé'], warnings: [], blockers: [] },
        { sourcePath: '/dev/sdc1', targetSanId: 'secondary', targetPath: '/dev/sde1', confidence: 'high', evidence: ['mapping confirmé'], warnings: [], blockers: [] },
      ],
      perNodePreflights: {
        primary: sourcePreflight,
        secondary: peerPreflight,
      },
      executionModesAllowed: ['all_nodes'],
    }, {
      ...payload,
      confirmation: 'CREATE md0',
      clusterExecution: {
        primarySanId: 'primary',
        requirePreflightOk: true,
      },
    })

    expect(plans.map(plan => plan.sanId)).toEqual(['primary', 'secondary'])
    expect(plans[0]?.command).toBe('mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdb1 /dev/sdc1')
    expect(plans[1]?.devices).toEqual(['/dev/sdd1', '/dev/sde1'])
    expect(plans[1]?.command).toBe('mdadm --create /dev/md0 --chunk=64 --level=1 --raid-devices=2 --run /dev/sdd1 /dev/sde1')
  })

  it('bloque un plan create_md multi-nœud sans membres avant exécution SSH', () => {
    const source = inventory('primary', [])
    const peer = inventory('secondary', [])

    try {
      buildCreateMdArrayNodeResults({
      ok: true,
      action: 'create_md',
      sourceSanId: 'primary',
      blockers: [],
      warnings: [],
      syncLimitations: [],
      nodes: [source, peer],
      mappings: [],
      perNodePreflights: {
        primary: { ok: true, action: 'create_md', riskLevel: 'risky', blockers: [], warnings: [], candidateChecks: [], commandPreview: undefined },
        secondary: { ok: true, action: 'create_md', riskLevel: 'risky', blockers: [], warnings: [], candidateChecks: [], commandPreview: undefined },
      },
      executionModesAllowed: ['all_nodes'],
      }, {
      name: 'md0',
      level: '1',
      chunkKb: 64,
      devices: [],
      confirmation: 'CREATE md0',
      clusterExecution: {
        primarySanId: 'primary',
        requirePreflightOk: true,
      },
      })
      throw new Error('Expected buildCreateMdArrayNodeResults to reject empty members')
    } catch (err: any) {
      expect(err.statusCode).toBe(400)
      expect(err.statusMessage).toMatch(/Commande MD invalide : aucune partition membre transmise\.|Plan création MD multi-nœud incomplet/)
    }
  })

  it('bloque les mappings de partitions hérités dupliqués vers le même pair', () => {
    const blockers = duplicateManualMappingBlockers([
      { sourcePath: '/dev/sdb1', targetSanId: 'secondary', targetPath: '/dev/sdd1', confirmedBy: 'derived_from_operator_disk_mapping', sourceKind: 'partition' },
      { sourcePath: '/dev/sdc1', targetSanId: 'secondary', targetPath: '/dev/sdd1', confirmedBy: 'derived_from_operator_disk_mapping', sourceKind: 'partition' },
    ])

    expect(blockers).toHaveLength(1)
    expect(blockers[0]).toContain('Mapping manuel dupliqué')
  })

  it('signale clairement une partition paire attendue manquante pour create_md', () => {
    const member = {
      ...disk('/dev/sdb1', 20_000),
      type: 'part',
      partitionTypeCode: '0xfd',
      partitionTypeName: 'Linux RAID Autodetect',
      eligibleForMd: true,
      mdEligibilityReasons: [],
    }
    const source = inventory('primary', [member])
    const peer = inventory('secondary', [{ ...member, name: 'sdd1', path: '/dev/sdd1' }])

    const mapping = mapDeviceToPeer('/dev/sdb1', source, peer, 'create_md', [{
      sourcePath: '/dev/sdb1',
      targetSanId: 'secondary',
      targetPath: '/dev/sde1',
    }])

    expect(mapping.confidence).toBe('none')
    expect(mapping.blockers).toContain('expected partition not found on peer node: /dev/sde1')
  })
})

// ─── Stopped MD — assemble command & preflight ───────────────────────────────
describe('Stopped MD — assemble command builders', () => {
  it('buildMdAssembleCommand sans membres explicites', () => {
    expect(buildMdAssembleCommand('md0')).toBe('mdadm --assemble /dev/md0')
  })

  it('buildMdAssembleCommand avec membres', () => {
    expect(buildMdAssembleCommand('md1', ['/dev/sdb1', '/dev/sdc1']))
      .toBe('mdadm --assemble /dev/md1 /dev/sdb1 /dev/sdc1')
  })

  it('phrases de confirmation assemble / zero', () => {
    expect(expectedMdAssembleConfirmation('md0')).toBe('ASSEMBLE md0')
    expect(expectedMdZeroMetadataConfirmation()).toBe('ZERO RAID METADATA')
    expect(expectedMdZeroSuperblocksConfirmation('md2')).toBe('ZERO RAID METADATA')
  })
})

describe('Stopped MD — preflight assemble_md / zero_md_superblocks', () => {
  const stoppedMd0: StoppedMdArray = {
    name: 'md0',
    path: '/dev/md0',
    uuid: 'aaa:bbb',
    raidLevel: '1',
    raidDevices: 2,
    members: [
      { path: '/dev/sdb1', present: true, memberStatus: 'md_superblock_detected' },
      { path: '/dev/sdc1', present: true, memberStatus: 'md_superblock_detected' },
    ],
    stoppedState: 'assemblable',
    warnings: [],
    detectedOn: 'both',
  }

  const activeMd0 = {
    name: 'md0',
    path: '/dev/md0',
    raidLevel: '1' as const,
    raidDevices: 2,
    activeDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    state: 'active' as const,
    members: [],
    usedBy: [],
  }

  const blockDevice = (path: string) => ({
    path,
    name: path.split('/').pop()!,
    type: 'part' as const,
    sizeBytes: 1,
    usedBy: [] as string[],
    eligibleForMd: true,
    eligibleForHardwareRaid: false,
    hasMdSuperblock: true,
    mdEligibilityReasons: [],
  })

  it('assemble_md bloque si le tableau est déjà actif', async () => {
    const result = await runPreflight(
      {} as any,
      { backend: 'software_md', action: 'assemble_md', payload: { name: 'md0' } },
      [],
      [activeMd0],
      undefined,
      [stoppedMd0],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some(b => b.includes('déjà actif'))).toBe(true)
  })

  it('assemble_md ok pour tableau arrêté assemblable', async () => {
    const result = await runPreflight(
      {} as any,
      { backend: 'software_md', action: 'assemble_md', payload: { name: 'md0', targetName: 'md0' } },
      [blockDevice('/dev/sdb1'), blockDevice('/dev/sdc1')],
      [],
      undefined,
      [stoppedMd0],
    )
    expect(result.ok).toBe(true)
    expect(result.commandPreview).toBe('mdadm --assemble /dev/md0 /dev/sdb1 /dev/sdc1')
  })

  it('assemble_md exige un nom cible valide pour name unknown', async () => {
    const orphanStopped: StoppedMdArray = {
      ...stoppedMd0,
      name: 'unknown',
      path: undefined,
    }
    const result = await runPreflight(
      {} as any,
      { backend: 'software_md', action: 'assemble_md', payload: { name: 'unknown', uuid: orphanStopped.uuid } },
      [blockDevice('/dev/sdb1'), blockDevice('/dev/sdc1')],
      [],
      undefined,
      [orphanStopped],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some(b => b.includes('cible requis'))).toBe(true)
  })

  const activeMd0WithMember = {
    ...activeMd0,
    members: [{ path: '/dev/sdb1', state: ['active' as const] }],
  }

  it('zero_md_superblocks ok for orphan partition while unrelated md0 is active', async () => {
    const result = await runPreflight(
      {} as any,
      {
        backend: 'software_md',
        action: 'zero_md_superblocks',
        payload: { members: ['/dev/sda1'] },
      },
      [blockDevice('/dev/sda1')],
      [activeMd0],
      undefined,
      [],
    )
    expect(result.ok).toBe(true)
    expect(result.requiredConfirmation).toBe('ZERO RAID METADATA')
    expect(result.commandPreview).toBe('mdadm --zero-superblock /dev/sda1')
  })

  it('zero_md_superblocks bloque si membre actif de tableau MD', async () => {
    const result = await runPreflight(
      {} as any,
      {
        backend: 'software_md',
        action: 'zero_md_superblocks',
        payload: { members: ['/dev/sdb1'] },
      },
      [blockDevice('/dev/sdb1')],
      [activeMd0WithMember],
      undefined,
      [],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some(b => b.includes('membre actif'))).toBe(true)
  })

  it('zero_md_superblocks bloque sans superblock MD', async () => {
    const result = await runPreflight(
      {} as any,
      {
        backend: 'software_md',
        action: 'zero_md_superblocks',
        payload: { members: ['/dev/sda1'] },
      },
      [{
        ...blockDevice('/dev/sda1'),
        hasMdSuperblock: false,
        mdExamine: undefined,
      }],
      [],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some(b => b.includes('aucun superblock MD'))).toBe(true)
  })

  it('zero_md_superblocks exige au moins une partition', async () => {
    const result = await runPreflight(
      {} as any,
      { backend: 'software_md', action: 'zero_md_superblocks', payload: { members: [] } },
      [],
      [],
    )
    expect(result.ok).toBe(false)
    expect(result.blockers.some(b => b.includes('Au moins une partition'))).toBe(true)
  })

  it('validateZeroSuperblockMembers is member-centric', () => {
    const blockers = validateZeroSuperblockMembers(
      ['/dev/sda1'],
      [blockDevice('/dev/sda1')],
      [activeMd0],
    )
    expect(blockers).toEqual([])
  })

  it('wipe_md_signatures preflight preview includes --force when only mdadm_examine', async () => {
    const result = await runPreflight(
      {} as any,
      {
        backend: 'software_md',
        action: 'wipe_md_signatures',
        payload: {
          members: ['/dev/sda1'],
          remainingSignatureTypes: { '/dev/sda1': ['mdadm_examine'] },
          detectionSourcesByMember: {
            '/dev/sda1': { mdadmExamine: true, wipefs: false, blkid: false },
          },
        },
      },
      [blockDevice('/dev/sda1')],
      [],
    )
    expect(result.ok).toBe(true)
    expect(result.commandPreview).toContain('mdadm --zero-superblock --force /dev/sda1')
    expect(result.commandPreview).not.toContain('wipefs -a')
  })
})

describe('md_add_device validation', () => {
  const md0: import('../server/utils/raid-types').MdArray = {
    name: 'md0',
    path: '/dev/md0',
    raidLevel: '1',
    state: 'clean',
    raidDevices: 2,
    activeDevices: 2,
    workingDevices: 2,
    failedDevices: 0,
    spareDevices: 0,
    members: [
      { path: '/dev/sdb1', state: ['active', 'sync'] },
      { path: '/dev/sdc1', state: ['active', 'sync'] },
    ],
    usedBy: [],
    warnings: [],
  }

  function eligiblePart(path: string) {
    return {
      name: path.replace('/dev/', ''),
      path,
      sizeBytes: 1_000_000,
      type: 'part' as const,
      usedBy: [] as const,
      eligibleForMd: true,
      eligibleForHardwareRaid: false,
      mdEligibilityReasons: [] as string[],
      eligibleForMdPartitionPrep: false,
      mdPartitionPrepReasons: [] as string[],
      warnings: [] as string[],
      partitionTypeCode: '0xfd',
    }
  }

  it('buildMdAddDeviceCommand formats mdadm --add', () => {
    expect(buildMdAddDeviceCommand('/dev/md0', '/dev/sdd1')).toBe('mdadm /dev/md0 --add /dev/sdd1')
  })

  it('allows spare on healthy RAID1', () => {
    const v = validateMdAddDeviceRequest({
      name: 'md0',
      device: '/dev/sdd1',
      intent: 'spare',
      mdArrays: [md0],
      blockDevices: [eligiblePart('/dev/sdd1')],
      tools: { mdadm: true } as any,
    })
    expect(v.ok).toBe(true)
    expect(v.commandPreview).toContain('mdadm /dev/md0 --add /dev/sdd1')
  })

  it('blocks spare on degraded array', () => {
    const v = validateMdAddDeviceRequest({
      name: 'md0',
      device: '/dev/sdd1',
      intent: 'spare',
      mdArrays: [{ ...md0, state: 'degraded', activeDevices: 1 }],
      blockDevices: [eligiblePart('/dev/sdd1')],
      tools: { mdadm: true } as any,
    })
    expect(v.ok).toBe(false)
  })

  it('allows replacement on degraded array', () => {
    const v = validateMdAddDeviceRequest({
      name: 'md0',
      device: '/dev/sdd1',
      intent: 'replacement',
      mdArrays: [{ ...md0, state: 'degraded', activeDevices: 1 }],
      blockDevices: [eligiblePart('/dev/sdd1')],
      tools: { mdadm: true } as any,
    })
    expect(v.ok).toBe(true)
  })

  it('runPreflight md_add_device uses spare confirmation phrase', async () => {
    const result = await runPreflight(
      {} as any,
      {
        backend: 'software_md',
        action: 'md_add_device',
        payload: { name: 'md0', device: '/dev/sdd1', intent: 'spare' },
      },
      [eligiblePart('/dev/sdd1')],
      [md0],
      { mdadm: true } as any,
    )
    expect(result.ok).toBe(true)
    expect(result.requiredConfirmation).toBe(expectedMdAddSpareConfirmation('md0', '/dev/sdd1'))
  })
})
