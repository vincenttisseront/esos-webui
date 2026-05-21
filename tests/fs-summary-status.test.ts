import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildFsSummaryStatus } from '~/utils/fs-summary-status'
import { filterActionableScanWarnings } from '~/utils/fs-scan-warnings'
import { buildFsFileioViewModel } from '~/utils/fs-fileio-view'
import type { FsOverview } from '~/types/filesystem'
import { useFsStore } from '~/stores/fs'

const emptyDiagnostics = {
  mountCounts: { findmnt: 0, lsblk: 0, df: 0, fileioData: 0, system: 0, other: 0 },
  scst: { configBytes: 0, handlers: 0, fileioDevices: 0, lunMappings: 0, sysfsDevices: 0 },
  candidates: { total: 0, eligible: 0, byKind: {} },
  vdiskScanRoots: [],
  excludedMounts: [],
  warnings: [],
}

function completeOverview(): FsOverview {
  return {
    scannedAt: Date.now(),
    mounts: [{
      mountPoint: '/mnt/vdisks',
      backingDevice: '/dev/md0',
      fsType: 'xfs',
      totalBytes: 1e12,
      freeBytes: 5e11,
      usedPct: 50,
      mounted: true,
      status: 'mounted',
      role: 'fileio_data',
      source: 'findmnt',
    }],
    vdiskFiles: [{
      path: '/mnt/vdisks/linux',
      fileName: 'linux',
      sizeBytes: 1e9,
      mountPoint: '/mnt/vdisks',
      scstDeviceNames: ['LINUX'],
      mapped: true,
    }],
    fileioDevices: [{
      name: 'LINUX',
      handler: 'vdisk_fileio',
      filename: '/mnt/vdisks/linux',
      attrs: {},
      mapped: true,
    }],
    lunMappings: [{
      targetName: '21:00:00:24:ff:91:60:bc',
      groupName: 'g',
      lunId: 0,
      deviceName: 'LINUX',
      handler: 'vdisk_fileio',
      filename: '/mnt/vdisks/linux',
      readOnly: false,
    }],
    backends: [],
    links: [],
    diagnostics: emptyDiagnostics,
    tools: {
      mkfs_xfs: true,
      mkfs_ext4: true,
      parted: true,
      fallocate: true,
      df: true,
      findmnt: true,
      blkid: true,
    },
    nextAction: { kind: 'none', messageKey: 'storage.fs.next.complete' },
    scanWarnings: [],
  }
}

describe('fs-summary-status', () => {
  it('returns ok for complete chain without errors', () => {
    const view = buildFsFileioViewModel(completeOverview())!
    expect(buildFsSummaryStatus({
      fileioView: view,
      fetchError: null,
      actionableWarnings: [],
      hasStaleData: false,
    })).toBe('ok')
  })

  it('returns attention when fetch failed', () => {
    const view = buildFsFileioViewModel(completeOverview())!
    expect(buildFsSummaryStatus({
      fileioView: view,
      fetchError: 'timeout',
      actionableWarnings: [],
      hasStaleData: true,
    })).toBe('attention')
  })
})

describe('fs-scan-warnings', () => {
  it('filters informational prefixes', () => {
    expect(filterActionableScanWarnings([
      'no eligible backends',
      'SCST config truncated',
      '',
    ])).toEqual(['SCST config truncated'])
  })
})

describe('fs store stale', () => {
  it('retains overview and sets error on failed fetch', async () => {
    setActivePinia(createPinia())
    const store = useFsStore()
    const prior = completeOverview()
    store.overview = prior
    store.lastRefresh = new Date()
    store.error = 'network error'
    expect(store.overview).toEqual(prior)
    expect(store.hasStaleData).toBe(true)
  })
})
