import { describe, expect, it } from 'vitest'
import { serializeScstConfig } from '../server/utils/scst-config-writer'
import {
  buildAtomicBase64FileWriteScript,
  contentToBase64,
  decodeBase64Content,
} from '../server/utils/remote-file-writer'

function hazardousScstConfig(): string {
  const lines = [
    'HANDLER vdisk_blockio {',
    '\tDEVICE test_dev {',
    "\t\tfilename /dev/mapper/data-photos & 'quote\" $var",
    '\t\tattr with;semicolon',
    '\t\tbacktick `cmd`',
    '\t}',
    '}',
    '',
  ]
  return lines.join('\n')
}

describe('remote-file-writer', () => {
  it('round-trips base64 content', () => {
    const raw = hazardousScstConfig()
    expect(decodeBase64Content(contentToBase64(raw))).toBe(raw)
  })

  it('does not embed raw config in printf', () => {
    const script = buildAtomicBase64FileWriteScript('/etc/scst.conf', hazardousScstConfig())
    expect(script).not.toMatch(/printf '%s' 'HANDLER/)
    expect(script).not.toMatch(/printf '%s' '.*&/)
    expect(script).not.toContain("filename /dev/mapper/data-photos &")
  })

  it('uses heredoc base64 and expandable temp path', () => {
    const script = buildAtomicBase64FileWriteScript('/etc/scst.conf', 'test\n')
    expect(script).toMatch(/<<'ESOS_B64_[a-f0-9]+'/)
    expect(script).toMatch(/tmp=\$\(printf '%s\.tmp\.%s' '\/etc\/scst\.conf' \$\$\)/)
    expect(script).not.toContain("'/etc/scst.conf.tmp.$$'")
    expect(script).toContain('[ -s "$tmp" ]')
    expect(script).toContain('mv "$tmp" \'/etc/scst.conf\'')
  })

  it('handles content with ampersand, quotes, dollar, newline in serialized SCST', () => {
    const content = serializeScstConfig({
      handlers: [{
        name: 'vdisk_blockio',
        devices: [{
          name: 'lv_test',
          handler: 'vdisk_blockio',
          filename: "/dev/x & ' \" $ \n",
          attrs: { key: 'a&b' },
        }],
      }],
      drivers: [],
    })
    const script = buildAtomicBase64FileWriteScript('/etc/scst.conf', content)
    const b64 = script.split('\n').find(l => /^[A-Za-z0-9+/=]+$/.test(l) && l.length > 20)
    expect(b64).toBeTruthy()
    expect(decodeBase64Content(b64!)).toBe(content)
    expect(script).not.toContain("/dev/x & '")
  })

})
