import { describe, expect, it } from 'vitest'
import {
  expectedFormatFsConfirmation,
  validateCreateFsInput,
  validateMountPoint,
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
  })

  it('vdisk size vs free space', () => {
    expect(validateVdiskSize(500, 1000)).toBeTruthy()
    expect(validateVdiskSize(900, 1000)).toBeTruthy()
    expect(validateVdiskSize(2 * 1024 * 1024, 1_000_000_000)).toBeNull()
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
