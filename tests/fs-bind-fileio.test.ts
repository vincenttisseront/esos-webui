import { describe, expect, it, vi, beforeEach } from 'vitest'

const createDeviceMock = vi.fn().mockResolvedValue(undefined)

vi.mock('../server/utils/scst-config-writer', () => ({
  createDevice: (...args: unknown[]) => createDeviceMock(...args),
}))

import { runBindFileio } from '../server/utils/fs-actions'

describe('runBindFileio', () => {
  beforeEach(() => {
    createDeviceMock.mockClear()
  })

  it('registers vdisk_fileio with nv_cache', async () => {
    const res = await runBindFileio({
      deviceName: 'photos_fileio',
      vdiskPath: '/mnt/vdisks/fs01/photos.img',
      nvCache: true,
    })
    expect(res.deviceName).toBe('photos_fileio')
    expect(createDeviceMock).toHaveBeenCalledWith(
      'vdisk_fileio',
      'photos_fileio',
      '/mnt/vdisks/fs01/photos.img',
      { nv_cache: '1' },
    )
  })

  it('omits nv_cache when disabled', async () => {
    await runBindFileio({
      deviceName: 'plain_fileio',
      vdiskPath: '/mnt/vdisks/fs01/plain.img',
      nvCache: false,
    })
    expect(createDeviceMock).toHaveBeenCalledWith(
      'vdisk_fileio',
      'plain_fileio',
      '/mnt/vdisks/fs01/plain.img',
      {},
    )
  })
})
