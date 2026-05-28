import { describe, expect, it, vi } from 'vitest'
import type { FileSystemMount } from '~/types/filesystem'
import {
  pickActiveFileioMount,
  persistActiveFileioMount,
  loadPersistedActiveFileioMount,
} from '~/utils/fs-active-filesystem'
import { computeFsNextAction } from '~/utils/fs-provisioning-chain'

function mount(partial: Partial<FileSystemMount> & Pick<FileSystemMount, 'mountPoint'>): FileSystemMount {
  return {
    backingDevice: '/dev/sdb1',
    fsType: 'xfs',
    totalBytes: 100_000_000_000,
    freeBytes: 50_000_000_000,
    usedPct: 50,
    mounted: true,
    status: 'mounted',
    role: 'fileio_data',
    source: 'df',
    ...partial,
  }
}

describe('pickActiveFileioMount', () => {
  it('prefers newly created mount over parent /mnt/vdisks', () => {
    const mounts = [
      mount({ mountPoint: '/mnt/vdisks', freeBytes: 1_000_000_000 }),
      mount({ mountPoint: '/mnt/vdisks/fs01', freeBytes: 80_000_000_000 }),
    ]
    const picked = pickActiveFileioMount(mounts, { newlyCreatedMountPoint: '/mnt/vdisks/fs01' })
    expect(picked?.mountPoint).toBe('/mnt/vdisks/fs01')
  })

  it('prefers child with more free space over bare vdisk root', () => {
    const mounts = [
      mount({ mountPoint: '/mnt/vdisks', freeBytes: 500_000_000 }),
      mount({ mountPoint: '/mnt/vdisks/fs01', freeBytes: 90_000_000_000 }),
    ]
    expect(pickActiveFileioMount(mounts)?.mountPoint).toBe('/mnt/vdisks/fs01')
  })

  it('uses explicit user selection when valid', () => {
    const mounts = [
      mount({ mountPoint: '/mnt/vdisks', freeBytes: 90_000_000_000 }),
      mount({ mountPoint: '/mnt/vdisks/fs02', freeBytes: 1_000_000_000 }),
    ]
    expect(pickActiveFileioMount(mounts, { preferredMountPoint: '/mnt/vdisks/fs02' })?.mountPoint)
      .toBe('/mnt/vdisks/fs02')
  })
})

describe('computeFsNextAction with active mount', () => {
  it('suggests vdisk on active child filesystem', () => {
    const mounts = [
      mount({ mountPoint: '/mnt/vdisks', freeBytes: 1e9 }),
      mount({ mountPoint: '/mnt/vdisks/fs01', freeBytes: 5e11 }),
    ]
    const overview = {
      scannedAt: Date.now(),
      mounts,
      vdiskFiles: [],
      fileioDevices: [],
      lunMappings: [],
      backends: [],
      links: [],
      diagnostics: {} as any,
      tools: {} as any,
      nextAction: { kind: 'create_fs' as const, messageKey: 'storage.fs.next.create_fs' },
      scanWarnings: [],
    }
    const next = computeFsNextAction(overview, { activeMountPoint: '/mnt/vdisks/fs01' })
    expect(next.kind).toBe('create_vdisk')
    expect(next.mountPoint).toBe('/mnt/vdisks/fs01')
  })
})

describe('active mount persistence', () => {
  it('stores and loads mount per san id in sessionStorage', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
    persistActiveFileioMount('test-san', '/mnt/vdisks/fs01')
    expect(loadPersistedActiveFileioMount('test-san')).toBe('/mnt/vdisks/fs01')
    vi.unstubAllGlobals()
  })
})
