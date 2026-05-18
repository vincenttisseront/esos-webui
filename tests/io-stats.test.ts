import { describe, it, expect, beforeEach } from 'vitest'
import {
  pushSessionSnapshots,
  pushDeviceSnapshots,
} from '../server/utils/metrics-store'
import { formatKbps, formatKbTotal } from '../stores/stats'
import type { SessionSnapshot, DeviceSnapshot } from '../server/utils/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSessionSnap(
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    capturedAt: Date.now(),
    target: '21:00:00:24:ff:91:60:bc',
    initiator: '21:00:00:24:ff:55:68:eb',
    driver: 'qla2x00t',
    lunsCount: 3,
    readKb: 0,
    writeKb: 0,
    ...overrides,
  }
}

function makeDeviceSnap(
  overrides: Partial<DeviceSnapshot> = {},
): DeviceSnapshot {
  return {
    capturedAt: Date.now(),
    device: 'LINUX',
    handler: 'vdisk_fileio',
    readKb: 0,
    writeKb: 0,
    readOps: 0,
    writeOps: 0,
    ...overrides,
  }
}

// ─── Tests ring buffer + deltas ──────────────────────────────────────────────

describe('metrics-store — sessions', () => {
  beforeEach(() => {
    // Réinitialise les Maps en injectant des sessions différentes
    // pour éviter les contaminations entre tests.
  })

  it('IO02 — delta correct entre deux snapshots', () => {
    const t0 = 1_000_000
    const snap1 = makeSessionSnap({ capturedAt: t0, readKb: 100_000, writeKb: 50_000 })
    const snap2 = makeSessionSnap({
      capturedAt: t0 + 10_000,
      readKb: 110_000,
      writeKb: 55_000,
    })

    // Utilise un driver+target+initiator unique pour isoler ce test
    snap1.driver = snap2.driver = 'test_io02'
    pushSessionSnapshots([snap1])
    const [result] = pushSessionSnapshots([snap2])

    // 10 000 KB en 10 s = 1 000 KB/s
    expect(result.readKbPerSec).toBe(1_000)
    // 5 000 KB en 10 s = 500 KB/s
    expect(result.writeKbPerSec).toBe(500)
  })

  it('IO03 — delta négatif (reboot compteur) → 0', () => {
    const t0 = 2_000_000
    const snap1 = makeSessionSnap({
      capturedAt: t0,
      readKb: 500_000,
      writeKb: 200_000,
      driver: 'test_io03',
    })
    const snap2 = makeSessionSnap({
      capturedAt: t0 + 10_000,
      readKb: 1_000, // valeur inférieure → reboot
      writeKb: 500,
      driver: 'test_io03',
    })

    pushSessionSnapshots([snap1])
    const [result] = pushSessionSnapshots([snap2])

    expect(result.readKbPerSec).toBe(0)
    expect(result.writeKbPerSec).toBe(0)
  })

  it('IO04 — ring buffer > MAX_POINTS → shift()', () => {
    const driver = 'test_io04'
    const base = 3_000_000
    const snaps: SessionSnapshot[] = Array.from({ length: 15 }, (_, i) =>
      makeSessionSnap({
        capturedAt: base + i * 10_000,
        readKb: i * 1_000,
        driver,
      }),
    )

    let lastResult = pushSessionSnapshots([snaps[0]])
    for (let i = 1; i < snaps.length; i++) {
      lastResult = pushSessionSnapshots([snaps[i]])
    }

    // L'historique de sparkline est capé à MAX_POINTS (12)
    expect(lastResult[0].history.length).toBeLessThanOrEqual(12)
  })
})

describe('metrics-store — devices', () => {
  it('IO02b — delta IOPS correct', () => {
    const t0 = 5_000_000
    const snap1 = makeDeviceSnap({
      capturedAt: t0,
      readKb: 0,
      writeKb: 0,
      readOps: 0,
      writeOps: 0,
      device: 'test_dev_io02b',
    })
    const snap2 = makeDeviceSnap({
      capturedAt: t0 + 10_000,
      readKb: 20_000,
      writeKb: 5_000,
      readOps: 200,
      writeOps: 50,
      device: 'test_dev_io02b',
    })

    pushDeviceSnapshots([snap1])
    const [result] = pushDeviceSnapshots([snap2])

    expect(result.readKbPerSec).toBe(2_000)
    expect(result.writeKbPerSec).toBe(500)
    expect(result.readOpsPerSec).toBe(20)
    expect(result.writeOpsPerSec).toBe(5)
  })
})

// ─── Formatage ────────────────────────────────────────────────────────────────

describe('formatKbps', () => {
  it('IO05 — 1500 KB/s → "1.5 MB/s"', () => {
    expect(formatKbps(1_500)).toBe('1.5 MB/s')
  })

  it('IO05b — 500 KB/s → "500 KB/s"', () => {
    expect(formatKbps(500)).toBe('500 KB/s')
  })

  it('IO05c — 2 097 152 KB/s → "2.0 GB/s"', () => {
    expect(formatKbps(2_097_152)).toBe('2.0 GB/s')
  })
})

describe('formatKbTotal', () => {
  it('IO06 — 511 164 604 382 KB → TB', () => {
    // 511 164 604 382 / 1 073 741 824 ≈ 476.18 TB
    const result = formatKbTotal(511_164_604_382)
    expect(result).toMatch(/TB$/)
    expect(result).toMatch(/^476\.\d{2} TB$/)
  })

  it('IO06b — 1 500 KB → "1.5 MB"', () => {
    expect(formatKbTotal(1_500)).toBe('1.5 MB')
  })

  it('IO06c — 500 KB → "500 KB"', () => {
    expect(formatKbTotal(500)).toBe('500 KB')
  })
})
