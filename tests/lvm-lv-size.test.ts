import { describe, expect, it } from 'vitest'
import { formatLvCreateSizeArg, overviewHasLv } from '../utils/lvm-lv-size'
import { buildLvCreatePreview } from '../server/utils/lvm-actions'

describe('lvm-lv-size', () => {
  it('formatLvCreateSizeArg uses GiB unit', () => {
    expect(formatLvCreateSizeArg(10 * 1024 ** 3)).toBe('10G')
  })

  it('buildLvCreatePreview uses explicit unit not raw bytes', () => {
    expect(buildLvCreatePreview('data', 'photos', 10 * 1024 ** 3)).toBe(
      'lvcreate -y -v -L 10G -n photos data',
    )
  })

  it('overviewHasLv detects LV in overview', () => {
    expect(overviewHasLv(
      [{ vgName: 'data', name: 'photos', path: '/dev/data/photos', sizeBytes: 1, uuid: '', attr: '', active: true }],
      'data',
      'photos',
    )).toBe(true)
  })
})
