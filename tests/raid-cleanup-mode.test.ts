import { describe, expect, it } from 'vitest'
import {
  buildAdvancedCleanupCommands,
  expectedMdAdvancedCleanupConfirmation,
  MD_ADVANCED_CLEANUP_CONFIRMATION,
} from '../server/utils/raid-md-metadata-diagnostics'

describe('MD cleanup mode contract', () => {
  it('advanced confirmation phrase is FORCE CLEAN MD METADATA', () => {
    expect(MD_ADVANCED_CLEANUP_CONFIRMATION).toBe('FORCE CLEAN MD METADATA')
    expect(expectedMdAdvancedCleanupConfirmation()).toBe('FORCE CLEAN MD METADATA')
  })

  it('advanced mode builds mdadm --zero-superblock --force for examine-only', () => {
    const cmds = buildAdvancedCleanupCommands(
      '/dev/sda1',
      ['mdadm_examine'],
      { mdadmExamine: true, wipefs: false, blkid: false },
    )
    expect(cmds).toEqual(['mdadm --zero-superblock --force /dev/sda1'])
    expect(cmds.join(' ')).not.toContain('wipefs -a')
  })

  it('advanced mode does not include basic zero without force', () => {
    const cmds = buildAdvancedCleanupCommands('/dev/sda1', ['mdadm_examine'])
    for (const cmd of cmds) {
      if (cmd.includes('mdadm --zero-superblock')) {
        expect(cmd).toContain('--force')
      }
    }
  })
})
