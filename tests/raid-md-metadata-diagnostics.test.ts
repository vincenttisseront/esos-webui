import { describe, expect, it, vi } from 'vitest'
import {
  advancedCleanupWithDiagnostics,
  buildAdvancedCleanupCommands,
  buildAdvancedWipeSignaturesCommand,
  buildRemainingSignatureTypes,
  buildZeroCleanupFailureError,
  computeRecommendedAction,
  isRaidRelatedSignature,
  zeroSuperblockWithDiagnostics,
  wipeSignaturesWithDiagnostics,
} from '../server/utils/raid-md-metadata-diagnostics'

describe('raid-md-metadata-diagnostics', () => {
  describe('buildRemainingSignatureTypes', () => {
    it('includes mdadm_examine when examine detects superblock', () => {
      const types = buildRemainingSignatureTypes({
        examineDetected: true,
        wipefsSignatures: [],
        blkidTypes: [],
      })
      expect(types).toContain('mdadm_examine')
    })

    it('includes wipefs linux_raid_member', () => {
      const types = buildRemainingSignatureTypes({
        examineDetected: false,
        wipefsSignatures: ['linux_raid_member'],
        blkidTypes: [],
      })
      expect(types).toContain('linux_raid_member')
    })
  })

  describe('computeRecommendedAction', () => {
    it('recommends advanced_wipe when zero ok but signatures remain', () => {
      expect(computeRecommendedAction({
        zeroSuccess: true,
        verifiedRemoved: false,
        remainingSignatureTypes: ['linux_raid_member'],
      })).toBe('advanced_wipe_signatures')
    })

    it('recommends manual_investigation when zero failed', () => {
      expect(computeRecommendedAction({
        zeroSuccess: false,
        verifiedRemoved: false,
        remainingSignatureTypes: ['linux_raid_member'],
      })).toBe('manual_investigation')
    })
  })

  describe('buildAdvancedCleanupCommands', () => {
    it('uses force zero only when only mdadm_examine remains', () => {
      const cmds = buildAdvancedCleanupCommands(
        '/dev/sda1',
        ['mdadm_examine'],
        { mdadmExamine: true, wipefs: false, blkid: false },
      )
      expect(cmds).toEqual(['mdadm --zero-superblock --force /dev/sda1'])
      expect(cmds.some(c => c.includes('wipefs -a'))).toBe(false)
    })

    it('runs wipefs before force zero when both signatures present', () => {
      const cmds = buildAdvancedCleanupCommands(
        '/dev/sda1',
        ['linux_raid_member', 'mdadm_examine'],
        { mdadmExamine: true, wipefs: true, blkid: false },
      )
      expect(cmds).toHaveLength(2)
      expect(cmds[0]).toBe('wipefs --types=linux_raid_member -a /dev/sda1')
      expect(cmds[1]).toBe('mdadm --zero-superblock --force /dev/sda1')
    })
  })

  describe('buildAdvancedWipeSignaturesCommand', () => {
    it('prefers --types=linux_raid_member when present', () => {
      const cmd = buildAdvancedWipeSignaturesCommand('/dev/sda1', ['linux_raid_member', 'mdadm_examine'])
      expect(cmd).toBe('wipefs --types=linux_raid_member -a /dev/sda1')
      expect(cmd).not.toContain('wipefs -a ')
    })

    it('uses targeted types for other RAID signatures', () => {
      const cmd = buildAdvancedWipeSignaturesCommand('/dev/sda1', ['mdraid'])
      expect(cmd).toContain('wipefs --types=mdraid -a /dev/sda1')
    })

    it('does not emit bare wipefs -a when only linux_raid_member listed', () => {
      const cmd = buildAdvancedWipeSignaturesCommand('/dev/sda1', ['linux_raid_member'])
      expect(cmd).not.toMatch(/^wipefs -a /)
    })
  })

  describe('isRaidRelatedSignature', () => {
    it('treats mdadm_examine as RAID-related', () => {
      expect(isRaidRelatedSignature('mdadm_examine')).toBe(true)
    })
  })

  describe('zeroSuperblockWithDiagnostics', () => {
    it('verifiedRemoved false when examine still has Magic after zero exit 0', async () => {
      const manager = {
        exec: vi.fn(async (cmd: string) => {
          if (cmd.includes('--zero-superblock')) {
            return { stdout: 'ok\n__MD_ZERO_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('--examine')) {
            return { stdout: '          Magic : a92b4efc\n__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('wipefs -n')) {
            return { stdout: '', stderr: '' }
          }
          if (cmd.includes('blkid')) {
            return { stdout: '', stderr: '' }
          }
          return { stdout: '', stderr: '' }
        }),
      }

      const result = await zeroSuperblockWithDiagnostics(manager as any, '/dev/sda1')
      expect(result.success).toBe(true)
      expect(result.verifiedRemoved).toBe(false)
      expect(result.diagnostics?.detectionSources.mdadmExamine).toBe(true)
      expect(result.diagnostics?.remainingSignatureTypes).toContain('mdadm_examine')
      expect(result.diagnostics?.recommendedAction).toBe('advanced_wipe_signatures')
    })

    it('recommendedAction advanced_wipe when wipefs shows linux_raid_member', async () => {
      const manager = {
        exec: vi.fn(async (cmd: string) => {
          if (cmd.includes('--zero-superblock')) {
            return { stdout: '__MD_ZERO_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('--examine')) {
            return { stdout: 'No md superblock detected.\n__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('wipefs -n')) {
            return {
              stdout: 'OFFSET       TYPE\n0x00001000   linux_raid_member\n__PROBE_EXIT__=0\n',
              stderr: '',
            }
          }
          if (cmd.includes('blkid')) {
            return { stdout: '', stderr: '' }
          }
          return { stdout: '', stderr: '' }
        }),
      }

      const result = await zeroSuperblockWithDiagnostics(manager as any, '/dev/sda1')
      expect(result.diagnostics?.recommendedAction).toBe('advanced_wipe_signatures')
      expect(result.diagnostics?.detectionSources.wipefs).toBe(true)
    })
  })

  describe('advancedCleanupWithDiagnostics', () => {
    it('verifiedRemoved true after force zero when examine-only remnant cleared', async () => {
      let forceZeroRan = false
      const manager = {
        exec: vi.fn(async (cmd: string) => {
          if (cmd.includes('mdadm --zero-superblock --force')) {
            forceZeroRan = true
            return { stdout: 'forced\n__MD_ZERO_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('mdadm --zero-superblock') && !cmd.includes('--force')) {
            return { stdout: '__MD_ZERO_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('--examine')) {
            return { stdout: forceZeroRan ? 'No md superblock detected.\n__PROBE_EXIT__=0\n' : '          Magic : abc\n__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('wipefs -n')) {
            return { stdout: '__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('blkid')) {
            return { stdout: '', stderr: '' }
          }
          return { stdout: '', stderr: '' }
        }),
      }

      const result = await advancedCleanupWithDiagnostics(
        manager as any,
        '/dev/sda1',
        ['mdadm_examine'],
        { mdadmExamine: true, wipefs: false, blkid: false },
      )
      expect(forceZeroRan).toBe(true)
      expect(result.command).toContain('--force')
      expect(result.verifiedRemoved).toBe(true)
    })
  })

  describe('wipeSignaturesWithDiagnostics', () => {
    it('verifiedRemoved true after wipe when probes clean', async () => {
      const manager = {
        exec: vi.fn(async (cmd: string) => {
          if (cmd.includes('wipefs --types=linux_raid_member')) {
            return { stdout: 'wiped\n__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('--examine')) {
            return { stdout: 'No md superblock detected.\n__PROBE_EXIT__=0\n', stderr: '' }
          }
          if (cmd.includes('wipefs -n')) {
            return { stdout: '', stderr: '' }
          }
          if (cmd.includes('blkid')) {
            return { stdout: '', stderr: '' }
          }
          return { stdout: '', stderr: '' }
        }),
      }

      const result = await wipeSignaturesWithDiagnostics(
        manager as any,
        '/dev/sda1',
        ['linux_raid_member'],
      )
      expect(result.success).toBe(true)
      expect(result.verifiedRemoved).toBe(true)
    })
  })

  describe('buildZeroCleanupFailureError', () => {
    it('includes message and data.results with diagnostics', () => {
      const err = buildZeroCleanupFailureError(
        [{
          partition: '/dev/sda1',
          command: 'mdadm --zero-superblock /dev/sda1',
          success: true,
          stdout: '',
          stderr: '',
          exitCode: 0,
          verifiedRemoved: false,
          diagnostics: {
            partition: '/dev/sda1',
            zeroSuperblock: { command: 'x', exitCode: 0, stdout: '', stderr: '', success: true },
            mdadmExamine: { command: 'e', exitCode: 0, stdout: 'Magic', stderr: '', detected: true },
            wipefsProbe: { command: 'w', exitCode: 0, stdout: '', stderr: '', signatures: [] },
            blkidProbe: { command: 'b', exitCode: 0, stdout: '', stderr: '', types: [], available: true },
            verifiedRemoved: false,
            remainingSignatureTypes: ['mdadm_examine'],
            detectionSources: { mdadmExamine: true, wipefs: false, blkid: false },
            recommendedAction: 'advanced_wipe_signatures',
          },
        }],
        [],
      )
      expect(err.statusCode).toBe(422)
      expect(err.message).toContain('/dev/sda1')
      expect(err.data?.results?.[0]?.diagnostics).toBeDefined()
    })
  })
})
