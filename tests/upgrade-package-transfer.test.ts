import { describe, it, expect } from 'vitest'
import {
  validatePackageFilename,
  buildBase64ChunkScript,
  buildExtractAndVerifyScript,
} from '../server/utils/upgrade-package-transfer'

describe('validatePackageFilename', () => {
  it('accepts zip and tar.gz', () => {
    expect(validatePackageFilename('esos-3.0.1.zip')).toBe(true)
    expect(validatePackageFilename('esos-3.0.1.tar.gz')).toBe(true)
  })

  it('rejects unknown extension', () => {
    expect(validatePackageFilename('package.exe')).toBe(false)
  })
})

describe('buildBase64ChunkScript', () => {
  it('truncates on first chunk', () => {
    const script = buildBase64ChunkScript('/tmp/a.zip', 'Zm9v', false)
    expect(script).toContain("> '/tmp/a.zip'")
    expect(script).not.toContain('>>')
  })

  it('appends on subsequent chunks', () => {
    const script = buildBase64ChunkScript('/tmp/a.zip', 'YmFy', true)
    expect(script).toContain(">> '/tmp/a.zip'")
  })
})

describe('buildExtractAndVerifyScript', () => {
  it('includes unzip and install.sh check', () => {
    const s = buildExtractAndVerifyScript('/tmp/x.zip', '/tmp/staging')
    expect(s).toContain('unzip')
    expect(s).toContain('INSTALL_OK')
  })
})
