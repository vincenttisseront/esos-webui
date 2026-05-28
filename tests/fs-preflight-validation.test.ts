import { describe, expect, it } from 'vitest'
import {
  expectedCreateFilesystemConfirmation,
  expectedFormatFsConfirmation,
  validateCreateFsInput,
  validateMountPoint,
  validateVdiskFileName,
  validateVdiskSize,
} from '~/utils/fs-preflight-validation'

describe('fs-preflight-validation', () => {
  it('rejects root mount', () => {
    expect(validateMountPoint('/')).toBeTruthy()
    expect(validateMountPoint('/boot')).toBeTruthy()
    expect(validateMountPoint('/mnt/vdisks/fs01')).toBeNull()
  })

  it('format confirmation phrase', () => {
    expect(expectedFormatFsConfirmation('/dev/md0')).toBe('FORMAT /dev/md0')
    expect(expectedCreateFilesystemConfirmation('/mnt/vdisks/fs01')).toBe('CREATE FILESYSTEM /mnt/vdisks/fs01')
  })

  it('vdisk size vs free space', () => {
    expect(validateVdiskSize(500, 1000)).toBeTruthy()
    expect(validateVdiskSize(900, 1000)).toBeTruthy()
    expect(validateVdiskSize(2 * 1024 * 1024, 1_000_000_000)).toBeNull()
  })

  it('rejects invalid vdisk file names', () => {
    expect(validateVdiskFileName('')).toBeTruthy()
    expect(validateVdiskFileName('../evil.img')).toBeTruthy()
    expect(validateVdiskFileName('ok-file_01.img')).toBeNull()
  })

  it('create fs input aggregates blockers', () => {
    const r = validateCreateFsInput({
      backendPath: '/dev/md0',
      fsType: 'xfs',
      label: 'fs01',
      mountPoint: '/mnt/x',
      blockers: ['mounted'],
    })
    expect(r.ok).toBe(false)
    expect(r.blockers).toContain('mounted')
  })
})
