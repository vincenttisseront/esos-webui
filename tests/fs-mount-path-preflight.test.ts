import { describe, expect, it } from 'vitest'
import {
  mountPathStateBlockerKey,
  mountPathStateWarningKey,
} from '../server/utils/fs-mount-path-preflight'

describe('fs-mount-path-preflight', () => {
  it('maps remote states to i18n blocker keys', () => {
    expect(mountPathStateBlockerKey('already_mounted')).toBe('storage.fs.errors.mount_point_already_mounted')
    expect(mountPathStateBlockerKey('non_empty_dir')).toBe('storage.fs.errors.mount_point_not_empty')
    expect(mountPathStateBlockerKey('parent_missing')).toBe('storage.fs.errors.mount_point_parent_missing')
    expect(mountPathStateBlockerKey('not_exists')).toBeNull()
  })

  it('warns on empty existing directory', () => {
    expect(mountPathStateWarningKey('empty_dir')).toBe('storage.fs.wizard.create_fs.warn_mount_dir_empty')
    expect(mountPathStateWarningKey('not_exists')).toBeNull()
  })
})
