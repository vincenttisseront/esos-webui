import { describe, expect, it } from 'vitest'
import { getRuntimeIdentity } from '../server/utils/deployment-runtime'
import { BINARIES_VOLUME_HINT } from '../server/utils/deployment-runtime'

describe('deployment-runtime', () => {
  it('getRuntimeIdentity returns user string', () => {
    const id = getRuntimeIdentity()
    expect(id.user.length).toBeGreaterThan(0)
  })

  it('BINARIES_VOLUME_HINT mentions writable volume path', () => {
    expect(BINARIES_VOLUME_HINT).toContain('/opt/esos-webui/binaries')
    expect(BINARIES_VOLUME_HINT).toContain('writable')
  })
})
