import { describe, expect, it } from 'vitest'
import { buildFstabAppendScript } from '~/server/utils/fs-fstab-writer'

describe('fs-fstab-writer', () => {
  it('appends new line', () => {
    const script = buildFstabAppendScript('# comment\n', 'UUID=x /mnt/a xfs defaults 0 0')
    expect(script).not.toBe('true')
    expect(script).toContain('base64')
  })

  it('idempotent when line exists', () => {
    const existing = 'UUID=x /mnt/a xfs defaults 0 0\n'
    const line = 'UUID=x /mnt/a xfs defaults 0 0'
    expect(buildFstabAppendScript(existing, line)).toBe('true')
  })

  it('replaces duplicate mount point', () => {
    const existing = 'UUID=old /mnt/a ext4 defaults 0 0\n'
    const script = buildFstabAppendScript(existing, 'UUID=new /mnt/a xfs defaults 0 0')
    expect(script).not.toBe('true')
  })
})
