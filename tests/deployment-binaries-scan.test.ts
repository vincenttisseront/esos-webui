import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import {
  inferBinaryKind,
  inferBinaryName,
  resolvePathUnderRoot,
  scanContainerBinariesDir,
} from '../server/utils/deployment-binaries-scan'

describe('deployment-binaries-scan', () => {
  it('infers kind and name from filename', () => {
    expect(inferBinaryKind('perccli-007.2618.0000.0000_A00_Linux.tar.gz.rpm')).toBe('rpm')
    expect(inferBinaryName('perccli-007.rpm')).toBe('perccli-007')
  })

  it('resolvePathUnderRoot rejects traversal', async () => {
    const root = join(tmpdir(), `esos-bin-scan-${randomUUID()}`)
    await mkdir(root, { recursive: true })
    try {
      expect(await resolvePathUnderRoot(root, '../etc/passwd')).toBeNull()
      expect(await resolvePathUnderRoot(root, 'foo/../../etc/passwd')).toBeNull()
      const inside = join(root, 'ok.rpm')
      await writeFile(inside, 'x')
      const resolved = await resolvePathUnderRoot(root, 'ok.rpm')
      expect(resolved).toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('scanContainerBinariesDir returns empty when dir missing', async () => {
    const prev = process.env.ESOS_BINARIES_DIR
    process.env.ESOS_BINARIES_DIR = join(tmpdir(), `missing-${randomUUID()}`)
    try {
      const files = await scanContainerBinariesDir()
      expect(files).toEqual([])
    } finally {
      if (prev === undefined) delete process.env.ESOS_BINARIES_DIR
      else process.env.ESOS_BINARIES_DIR = prev
    }
  })
})
