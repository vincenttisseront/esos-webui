import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLvmStore } from '../stores/lvm'

describe('lvm store lvExistsAfterRefresh', () => {
  it('detects LV in overview after refresh', () => {
    setActivePinia(createPinia())
    const store = useLvmStore()
    store.overview = {
      scannedAt: 0,
      tools: {
        pvs: true, vgs: true, lvs: true, pvcreate: true, vgcreate: true, lvcreate: true,
        vgremove: true, lvremove: true, pvremove: true, wipefs: true, blkid: true,
      },
      pvs: [],
      vgs: [],
      lvs: [{ name: 'photos', vgName: 'data', path: '/dev/data/photos', sizeBytes: 1, uuid: '', attr: '', active: true }],
      candidates: [],
      alerts: [],
    }
    expect(store.lvExistsAfterRefresh('data', 'photos')).toBe(true)
    expect(store.lvExistsAfterRefresh('data', 'other')).toBe(false)
  })
})
