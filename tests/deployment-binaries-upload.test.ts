import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  assertBinariesDirWritable,
  getBinariesStorageStatus,
  validateUploadFilename,
  writeBinaryFileAtomic,
} from '../server/utils/deployment-binaries-storage'
import { isAllowedBinaryFilename } from '../server/utils/deployment-binaries-scan'

describe('deployment-binaries-upload', () => {
  let prevDir: string | undefined
  let tempRoot: string

  beforeEach(async () => {
    prevDir = process.env.ESOS_BINARIES_DIR
    tempRoot = join(tmpdir(), `esos-bin-upload-${randomUUID()}`)
    await mkdir(tempRoot, { recursive: true })
    process.env.ESOS_BINARIES_DIR = tempRoot
  })

  afterEach(async () => {
    if (prevDir === undefined) delete process.env.ESOS_BINARIES_DIR
    else process.env.ESOS_BINARIES_DIR = prevDir
    await rm(tempRoot, { recursive: true, force: true })
  })

  it('validateUploadFilename rejects invalid names and extensions', () => {
    expect(() => validateUploadFilename('')).toThrow()
    expect(() => validateUploadFilename('.hidden.rpm')).toThrow()
    expect(() => validateUploadFilename('evil.exe')).toThrow()
    expect(() => validateUploadFilename('bad?.rpm')).toThrow()
  })

  it('accepts perccli rpm filename', () => {
    const name = validateUploadFilename('perccli-1.17.10-1.noarch.rpm')
    expect(name).toBe('perccli-1.17.10-1.noarch.rpm')
    expect(isAllowedBinaryFilename(name)).toBe(true)
  })

  it('getBinariesStorageStatus reports writable dir', async () => {
    const status = await getBinariesStorageStatus()
    expect(status.path).toBe(tempRoot)
    expect(status.exists).toBe(true)
    expect(status.writable).toBe(true)
    expect(status.errorCode).toBeUndefined()
  })

  it('writeBinaryFileAtomic creates file under directory', async () => {
    const data = Buffer.from('rpm-payload')
    const path = await writeBinaryFileAtomic(tempRoot, 'test.rpm', data)
    expect(path).toContain('test.rpm')
    const status = await getBinariesStorageStatus()
    expect(status.fileCount).toBeGreaterThanOrEqual(1)
  })

  it('assertBinariesDirWritable throws on read-only directory', async () => {
    if (process.platform === 'win32') return
    const roDir = join(tempRoot, 'readonly')
    await mkdir(roDir, { recursive: true })
    process.env.ESOS_BINARIES_DIR = roDir
    await chmod(roDir, 0o555)
    try {
      await expect(assertBinariesDirWritable()).rejects.toMatchObject({
        statusCode: 503,
        data: { code: 'BINARIES_DIR_NOT_WRITABLE' },
      })
    } finally {
      await chmod(roDir, 0o755)
    }
  })
})
