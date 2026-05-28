import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCreateFilesystemCommands } from '~/utils/fs-command-builder'
import {
  buildFsSignatureSummary,
  fsCreateWizardNeedsWipe,
  isFsBackendEsosProtected,
  mountPointFromFsLabel,
  shouldShowFsBackendSelect,
  syncMountPointFromLabel,
} from '~/utils/fs-create-wizard-ui'
import { backendsEligibleForCreateFs } from '~/utils/fs-wizard-filters'
import { expectedCreateFilesystemConfirmation } from '~/utils/fs-preflight-validation'
import type { FsBackendRef } from '~/types/filesystem'

const wizardSource = readFileSync(
  resolve(process.cwd(), 'components/fs/CreateFilesystemWizard.vue'),
  'utf8',
)

function hwBackend(overrides?: Partial<FsBackendRef>): FsBackendRef {
  return {
    path: '/dev/sdb',
    kind: 'hw_raid_ld',
    source: 'hw_raid',
    sizeBytes: 100_000_000_000,
    eligible: true,
    eligibility: 'eligible_clean',
    reasons: [],
    displayName: '1/vd1',
    hwLdId: '1/vd1',
    controllerLabel: 'PERC H710',
    raidLevel: '1',
    ...overrides,
  }
}

describe('fs-create-wizard-ui helpers', () => {
  it('shows backend select only when multiple eligible backends exist', () => {
    expect(shouldShowFsBackendSelect([])).toBe(false)
    expect(shouldShowFsBackendSelect([hwBackend()])).toBe(false)
    expect(shouldShowFsBackendSelect([hwBackend(), hwBackend({ path: '/dev/sdc' })])).toBe(true)
  })

  it('derives mount point from label and syncs until manual edit', () => {
    expect(mountPointFromFsLabel('fs01')).toBe('/mnt/vdisks/fs01')
    expect(mountPointFromFsLabel('data-02')).toBe('/mnt/vdisks/data-02')
    const synced = syncMountPointFromLabel('newfs', '/mnt/vdisks/fs01', '/mnt/vdisks/fs01')
    expect(synced).toEqual({ mountPoint: '/mnt/vdisks/newfs', lastSuggestedMount: '/mnt/vdisks/newfs' })
    expect(syncMountPointFromLabel('newfs', '/custom/mount', '/mnt/vdisks/fs01')).toBeNull()
  })

  it('exposes signature details with device path', () => {
    const summary = buildFsSignatureSummary(hwBackend({
      eligibility: 'eligible_with_wipe_required',
      signatures: ['xfs', 'gpt'],
      reasons: ['storage.fs.backend.reason.filesystem_signature'],
    }))
    expect(summary.devicePath).toBe('/dev/sdb')
    expect(summary.signatures).toEqual(['xfs', 'gpt'])
    expect(summary.reasonKeys).toContain('storage.fs.backend.reason.filesystem_signature')
  })

  it('detects wipe-required backends', () => {
    expect(fsCreateWizardNeedsWipe(hwBackend())).toBe(false)
    expect(fsCreateWizardNeedsWipe(hwBackend({ eligibility: 'eligible_with_wipe_required' }))).toBe(true)
  })

  it('blocks ESOS-protected backends via protection snapshot', () => {
    const backend = hwBackend({ path: '/dev/sda1', mountPoint: '/mnt/root' })
    expect(isFsBackendEsosProtected(backend, {
      protectedMountPoints: ['/mnt/root'],
      protectedFilePaths: [],
      detectionFailed: false,
      errors: [],
    })).toBe(true)
    expect(backendsEligibleForCreateFs([backend], {
      protectedMountPoints: ['/mnt/root'],
      protectedFilePaths: [],
      detectionFailed: false,
      errors: [],
    })).toHaveLength(0)
  })

  it('uses CREATE FILESYSTEM mountpoint confirmation phrase', () => {
    expect(expectedCreateFilesystemConfirmation('/mnt/vdisks/fs01')).toBe('CREATE FILESYSTEM /mnt/vdisks/fs01')
  })

  it('generates wipefs, partition, mkfs, mkdir, mount commands', () => {
    const cmds = buildCreateFilesystemCommands({
      backendPath: '/dev/sdb',
      fsType: 'xfs',
      label: 'fs01',
      mountPoint: '/mnt/vdisks/fs01',
      partitionStrategy: 'gpt',
      wipeBeforeFormat: true,
    })
    expect(cmds.some(c => c.includes('wipefs -a') && c.includes('/dev/sdb'))).toBe(true)
    expect(cmds.some(c => c.includes('parted') && c.includes('mklabel gpt'))).toBe(true)
    expect(cmds.some(c => c.includes('mkfs.xfs'))).toBe(true)
    expect(cmds.some(c => c.includes('mkdir -p') && c.includes('/mnt/vdisks/fs01'))).toBe(true)
    expect(cmds.some(c => c.includes('mount'))).toBe(true)
  })
})

describe('CreateFilesystemWizard layout', () => {
  it('shows backend summary card instead of select for a single backend', () => {
    expect(wizardSource).toContain('shouldShowFsBackendSelect')
    expect(wizardSource).toContain('backend_summary_title')
    expect(wizardSource).toContain('v-if="!showBackendSelect"')
    expect(wizardSource).not.toContain('v-model="allowWipeSignatures"')
  })

  it('shows wipe confirmation on final step only', () => {
    expect(wizardSource).toContain('v-model="confirmWipeSignatures"')
    expect(wizardSource).toContain('wipe_final_title')
    expect(wizardSource).not.toContain("t('storage.fs.wizard.create_fs.wipe_warning')")
  })

  it('shows signature details with device path', () => {
    expect(wizardSource).toContain('signatures_title')
    expect(wizardSource).toContain('signatures_device')
    expect(wizardSource).toContain('buildFsSignatureSummary')
  })
})
