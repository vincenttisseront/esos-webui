import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { computeFileSha256 } from '../server/utils/deployment-binaries-catalog'

describe('deployment-catalog', () => {
  it('computeFileSha256 is stable', async () => {
    const dir = join(tmpdir(), `esos-sha-${randomUUID()}`)
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'test.bin')
    await writeFile(file, 'hello deployment')
    try {
      const h1 = await computeFileSha256(file)
      const h2 = await computeFileSha256(file)
      expect(h1).toBe(h2)
      expect(h1).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
