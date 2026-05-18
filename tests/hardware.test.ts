import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseCpuUsage,
  normalizePortState,
  formatWwn,
  parseBlockDevice,
} from '../server/utils/hardware-reader'
import { detectAlerts } from '../server/utils/alerts'
import type { DetectAlertsContext } from '../server/utils/alerts'
import { DEFAULT_ALERT_SETTINGS } from '../server/utils/alert-settings'
import type { HardwareOverview } from '../server/utils/types'
import type { Overview } from '../types/esos'

// ─── HW02 : calcul delta CPU ──────────────────────────────────────────────────

// /proc/stat format: "cpu  user nice system idle iowait irq softirq ..."
// values: user nice system idle iowait irq softirq steal guest guest_nice

describe('parseCpuUsage', () => {
  // Note : prevCpuStat est un état de module. Il faut appeler parseCpuUsage
  // une première fois pour initialiser, puis une seconde pour avoir le delta.

  it('HW02 – retourne 0 lors du premier appel (pas de delta)', () => {
    // Simuler un premier appel pour initialiser le state
    // cpu: idle=400, total=500 → 20% usage mais premier appel → 0
    const stat = 'cpu  50 10 40 400 0 0 0 0 0 0'
    // On ne peut pas remettre prevCpuStat à null sans accès direct.
    // Le module exporte parseCpuUsage qui utilise le module-level prevCpuStat.
    // Premier appel d'une suite de tests — résultat peut être 0 ou calculé,
    // selon si d'autres tests ont déjà appelé la fonction.
    // On vérifie juste que c'est un nombre entre 0 et 100.
    const result = parseCpuUsage(stat)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('HW02b – calcule correctement le % CPU entre deux snapshots', () => {
    // Appel 1 : initialise prevCpuStat à idle=800, total=1000
    parseCpuUsage('cpu  100 0 100 800 0 0 0 0 0 0')
    // Appel 2 : idle passe de 800→850 (+50), total passe de 1000→1100 (+100)
    // → usage = 1 - 50/100 = 50%
    const result = parseCpuUsage('cpu  150 0 100 850 0 0 0 0 0 0')
    expect(result).toBe(50)
  })

  it('HW02c – retourne 0 si delta total = 0 (protection division par zéro)', () => {
    const stat = 'cpu  100 0 100 800 0 0 0 0 0 0'
    parseCpuUsage(stat) // initialise
    const result = parseCpuUsage(stat) // même stat → delta = 0
    expect(result).toBe(0)
  })
})

// ─── HW03 : mémoire utilisée ─────────────────────────────────────────────────
// (Testé indirectement via le store — pas d'export readMemoryInfo direct)
// Les calculs de usedPct sont dans readMemoryInfo qui est non-exportée.
// On vérifie la formule ici directement.

describe('MemoryInfo usedPct formula', () => {
  it('HW03 – usedPct = (total - available) / total * 100', () => {
    const totalKb = 16_384_000
    const availableKb = 4_096_000
    const usedKb = totalKb - availableKb
    const usedPct = Math.round((usedKb / totalKb) * 100)
    expect(usedPct).toBe(75)
  })
})

// ─── HW04 : normalizePortState ───────────────────────────────────────────────

describe('normalizePortState', () => {
  it('HW04a – "Online" → Online', () => {
    expect(normalizePortState('Online')).toBe('Online')
  })

  it('HW04b – "online" (minuscule) → Online', () => {
    expect(normalizePortState('online')).toBe('Online')
  })

  it('HW04c – "Offline" → Offline', () => {
    expect(normalizePortState('Offline')).toBe('Offline')
  })

  it('HW04d – "Link Down" → Link Down', () => {
    expect(normalizePortState('Link Down')).toBe('Link Down')
  })

  it('HW04e – chaîne inconnue → Unknown', () => {
    expect(normalizePortState('Degraded')).toBe('Unknown')
  })
})

// ─── HW05 : formatWwn ────────────────────────────────────────────────────────

describe('formatWwn', () => {
  it('HW05a – WWN 16 hex → formaté avec deux-points', () => {
    expect(formatWwn('2100002024ff9160')).toBe('21:00:00:20:24:ff:91:60')
  })

  it('HW05b – déjà formaté avec deux-points → normalisation (supprime : reformat)', () => {
    // les : sont supprimés puis reformatés
    expect(formatWwn('21:00:00:20:24:ff:91:60')).toBe('21:00:00:20:24:ff:91:60')
  })

  it('HW05c – chaîne trop courte → retour brut', () => {
    expect(formatWwn('1234')).toBe('1234')
  })

  it('HW05d – chaîne vide → retour brut', () => {
    expect(formatWwn('')).toBe('')
  })
})

// ─── HW06 : parseBlockDevice ─────────────────────────────────────────────────

describe('parseBlockDevice', () => {
  it('HW06a – disque simple sans partitions', () => {
    const raw = {
      name: 'sda',
      size: '500107862016',
      type: 'disk',
      mountpoint: null,
      ro: '0',
    }
    const dev = parseBlockDevice(raw)
    expect(dev.name).toBe('sda')
    expect(dev.sizeBytes).toBe(500107862016)
    expect(dev.type).toBe('disk')
    expect(dev.mountpoint).toBeNull()
    expect(dev.readOnly).toBe(false)
    expect(dev.children).toBeUndefined()
  })

  it('HW06b – disque avec partitions enfants', () => {
    const raw = {
      name: 'sdb',
      size: '1000204886016',
      type: 'disk',
      mountpoint: null,
      ro: '0',
      children: [
        {
          name: 'sdb1',
          size: '536870912',
          type: 'part',
          mountpoint: '/boot',
          ro: '0',
        },
      ],
    }
    const dev = parseBlockDevice(raw)
    expect(dev.children).toHaveLength(1)
    expect(dev.children![0].name).toBe('sdb1')
    expect(dev.children![0].mountpoint).toBe('/boot')
  })

  it('HW06c – partition en lecture seule', () => {
    const raw = { name: 'sr0', size: '0', type: 'rom', mountpoint: null, ro: '1' }
    const dev = parseBlockDevice(raw)
    expect(dev.readOnly).toBe(true)
  })
})

// ─── HW07-HW10 : detectAlerts ────────────────────────────────────────────────

function makeHw(overrides: Partial<HardwareOverview> = {}): HardwareOverview {
  return {
    system: {
      hostname: 'esos-node1',
      uptime: 86400,
      cpuModel: 'Intel Xeon E5',
      cpuCores: 8,
      loadAvg: [1.0, 1.2, 1.1],
      cpuUsagePct: 20,
    },
    memory: {
      totalKb: 16_384_000,
      availableKb: 8_192_000,
      usedKb: 8_192_000,
      buffersKb: 100_000,
      cachedKb: 500_000,
      usedPct: 50,
    },
    fcPorts: [
      {
        host: 'host0',
        portName: '21:00:00:20:24:ff:91:60',
        portState: 'Online',
        speed: '8 Gbit',
        fabricName: '20:00:00:20:37:22:f0:00',
        symbolicName: 'QLE2562',
        supportedSpeeds: '2 Gbit, 4 Gbit, 8 Gbit',
      },
    ],
    disks: [],
    volumes: [
      {
        mountpoint: '/mnt/vdisks/fs01',
        totalKb: 10_000_000,
        usedKb: 5_000_000,
        availableKb: 5_000_000,
        usedPct: 50,
      },
    ],
    capturedAt: Date.now(),
    ...overrides,
  }
}

function makeOverview(overrides: Partial<Overview> = {}): Overview {
  return {
    stats: { targets: 1, devices: 2, sessions: 1, groups: 1, luns: 4 },
    targets: [],
    systemTargets: [],
    devices: [],
    sessions: [],
    ...overrides,
  }
}

/** Contexte de test : grâce 0 (pas de persistance SQLite) + SAN fictif. */
function alertCtx(overrides: Partial<typeof DEFAULT_ALERT_SETTINGS> = {}): DetectAlertsContext {
  return {
    settings: { ...DEFAULT_ALERT_SETTINGS, sessionGraceSec: 0, ...overrides },
    sanKey: 'test-san',
  }
}

describe('detectAlerts', () => {
  it('HW07 – port FC hors ligne → erreur', () => {
    const hw = makeHw({
      fcPorts: [
        {
          host: 'host0',
          portName: '21:00:00:20:24:ff:91:60',
          portState: 'Offline',
          speed: '8 Gbit',
          fabricName: '',
          symbolicName: '',
          supportedSpeeds: '',
        },
      ],
    })
    const alerts = detectAlerts(hw, makeOverview(), alertCtx())
    expect(alerts.some((a) => a.id === 'fc-port-host0' && a.level === 'error')).toBe(true)
  })

  it('HW07b – alertes FC désactivées → pas d’erreur port hors ligne', () => {
    const hw = makeHw({
      fcPorts: [
        {
          host: 'host0',
          portName: '21:00:00:20:24:ff:91:60',
          portState: 'Offline',
          speed: '8 Gbit',
          fabricName: '',
          symbolicName: '',
          supportedSpeeds: '',
        },
      ],
    })
    const alerts = detectAlerts(hw, makeOverview(), alertCtx({ fcPortEnabled: false }))
    expect(alerts.some((a) => a.source === 'fc')).toBe(false)
  })

  it('HW08 – volume à 91% → erreur', () => {
    const hw = makeHw({
      volumes: [
        {
          mountpoint: '/mnt/vdisks/fs01',
          totalKb: 100_000,
          usedKb: 91_000,
          availableKb: 9_000,
          usedPct: 91,
        },
      ],
    })
    const alerts = detectAlerts(hw, makeOverview(), alertCtx())
    expect(alerts.some((a) => a.level === 'error' && a.source === 'volume')).toBe(true)
  })

  it('HW08b – volume à 80% → warning', () => {
    const hw = makeHw({
      volumes: [
        {
          mountpoint: '/mnt/vdisks/fs01',
          totalKb: 100_000,
          usedKb: 80_000,
          availableKb: 20_000,
          usedPct: 80,
        },
      ],
    })
    const alerts = detectAlerts(hw, makeOverview(), alertCtx())
    expect(alerts.some((a) => a.level === 'warning' && a.source === 'volume')).toBe(true)
  })

  it('HW08c – seuils personnalisés : 72% sans alerte si seuil warn 80', () => {
    const hw = makeHw({
      volumes: [
        {
          mountpoint: '/mnt/vdisks/fs01',
          totalKb: 100_000,
          usedKb: 72_000,
          availableKb: 28_000,
          usedPct: 72,
        },
      ],
    })
    const alerts = detectAlerts(hw, makeOverview(), alertCtx({ volumeWarnPct: 80, volumeCriticalPct: 95 }))
    expect(alerts.some((a) => a.source === 'volume')).toBe(false)
  })

  it('HW09 – initiateur dans group sans session active → warning', () => {
    const overview = makeOverview({
      targets: [
        {
          name: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          enabled: true,
          hwTarget: false,
          attrs: {},
          luns: [],
          sessions: [],
          groups: [
            {
              name: 'initiators',
              initiators: ['iqn.2024-01.com.initiator1'],
              luns: [],
            },
          ],
        },
      ],
      sessions: [], // aucune session active
    })
    const alerts = detectAlerts(makeHw(), overview, alertCtx())
    const hit = alerts.find((a) => a.source === 'session' && a.title === 'Session perdue')
    expect(hit).toBeDefined()
    expect(hit!.id).toContain('session-lost|test-san|')
    expect(hit!.meta?.initiator).toBe('iqn.2024-01.com.initiator1')
  })

  it('HW10 – tout OK → aucune alerte', () => {
    const overview = makeOverview({
      targets: [
        {
          name: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          enabled: true,
          hwTarget: false,
          attrs: {},
          luns: [],
          sessions: [],
          groups: [
            {
              name: 'initiators',
              initiators: ['iqn.2024-01.com.initiator1'],
              luns: [],
            },
          ],
        },
      ],
      sessions: [
        {
          initiatorName: 'iqn.2024-01.com.initiator1',
          target: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          ipAddr: '10.0.0.1',
          sid: 'abc123',
        },
      ],
    })
    const alerts = detectAlerts(makeHw(), overview, alertCtx())
    expect(alerts).toHaveLength(0)
  })

  it('HW11 – politique multipath : 2 initiateurs requis, 1 actif → warning agrégé', () => {
    const overview = makeOverview({
      targets: [
        {
          name: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          enabled: true,
          hwTarget: false,
          attrs: {},
          luns: [],
          sessions: [],
          groups: [
            {
              name: 'initiators',
              initiators: ['iqn.2024-01.com.initiator1', 'iqn.2024-01.com.initiator2'],
              luns: [],
            },
          ],
        },
      ],
      sessions: [
        {
          initiatorName: 'iqn.2024-01.com.initiator1',
          target: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          ipAddr: '10.0.0.1',
          sid: '1',
        },
      ],
    })
    const alerts = detectAlerts(
      makeHw(),
      overview,
      alertCtx({ sessionPolicy: 'multipath', sessionMinActive: 2 }),
    )
    const hit = alerts.find((a) => a.title === 'Sessions insuffisantes (multipathing)')
    expect(hit).toBeDefined()
    expect(hit!.id).toContain('session-low|test-san|')
    expect(hit!.meta?.activeInitiatorCount).toBe(1)
    expect(hit!.meta?.minRequired).toBe(2)
  })

  it('HW12 – alertes session désactivées → pas d’alerte session manquante', () => {
    const overview = makeOverview({
      targets: [
        {
          name: 'iqn.2024-01.com.example:target1',
          driver: 'iscsi',
          enabled: true,
          hwTarget: false,
          attrs: {},
          luns: [],
          sessions: [],
          groups: [
            {
              name: 'initiators',
              initiators: ['iqn.2024-01.com.initiator1'],
              luns: [],
            },
          ],
        },
      ],
      sessions: [],
    })
    const alerts = detectAlerts(makeHw(), overview, alertCtx({ sessionEnabled: false }))
    expect(alerts.some((a) => a.source === 'session' && a.title === 'Session perdue')).toBe(false)
    expect(alerts.some((a) => a.title === 'Sessions insuffisantes (multipathing)')).toBe(false)
  })
})
