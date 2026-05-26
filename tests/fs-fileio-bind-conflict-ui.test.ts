import { describe, expect, it } from 'vitest'
import {
  fileioConflictBlocksCreate,
  formatFileioBindConflictMessage,
  parseFileioBindConflictFromError,
} from '~/utils/fs-fileio-bind-conflict'

describe('fs-fileio-bind-conflict ui', () => {
  it('parses 409 conflict from fetch error shape', () => {
    const conflict = parseFileioBindConflictFromError({
      statusCode: 409,
      statusMessage: 'exists',
      data: {
        code: 'device_name_exists',
        conflict: {
          code: 'device_name_exists',
          message: 'exists',
          deviceName: 'PHOTOS',
          filePath: '/mnt/vdisks/disk1',
        },
      },
    })
    expect(conflict?.code).toBe('device_name_exists')
    expect(conflict?.deviceName).toBe('PHOTOS')
  })

  it('formats localized conflict message', () => {
    const msg = formatFileioBindConflictMessage(
      {
        code: 'vdisk_file_already_fileio',
        message: 'fallback',
        existingDeviceName: 'DISK1',
        filePath: '/mnt/vdisks/disk1',
      },
      (key, params) => {
        if (key === 'storage.fs.wizard.fileio.conflict.vdisk_file_already_fileio') {
          return `FILEIO ${params?.existingDeviceName}`
        }
        return key
      },
    )
    expect(msg).toBe('FILEIO DISK1')
  })

  it('blocks create for existing registration conflicts', () => {
    expect(fileioConflictBlocksCreate({
      code: 'vdisk_file_already_fileio',
      message: 'x',
    })).toBe(true)
    expect(fileioConflictBlocksCreate({
      code: 'invalid_device_name',
      message: 'x',
    })).toBe(false)
  })
})
