import { describe, it, expect } from 'vitest'
import {
  maskDbUri,
  detectDbType,
  validatePerfAgentConfigUpdate,
} from '../server/utils/perf-agent-config'

// ─── PM01 – PM04 : parsing / masquage / validation ───────────────────────────

describe('perf-agent-config', () => {
  it('PM01 — maskDbUri masque le mot de passe PostgreSQL', () => {
    const uri = 'postgres://perf_user:s3cr3t@10.0.0.20/esos_perf'
    expect(maskDbUri(uri)).toBe('postgres://perf_user:********@10.0.0.20/esos_perf')
  })

  it('PM02 — maskDbUri masque le mot de passe MySQL', () => {
    const uri = 'mysql://root:P@ssw0rd@db.local/metrics'
    expect(maskDbUri(uri)).toBe('mysql://root:********@db.local/metrics')
  })

  it('PM02b — maskDbUri sans mot de passe reste inchangé', () => {
    const uri = 'postgres://user@host/db'
    const masked = maskDbUri(uri)
    // Pas de ":password@", rien à masquer
    expect(masked).toBe('postgres://user@host/db')
  })

  it('PM03 — detectDbType détecte postgres://', () => {
    expect(detectDbType('postgres://user:pw@host/db')).toBe('postgres')
  })

  it('PM03b — detectDbType détecte postgresql://', () => {
    expect(detectDbType('postgresql://user:pw@host/db')).toBe('postgres')
  })

  it('PM03c — detectDbType détecte mysql://', () => {
    expect(detectDbType('mysql://user:pw@host/db')).toBe('mysql')
  })

  it('PM03d — detectDbType retourne unknown pour URI inconnue', () => {
    expect(detectDbType('sqlite:///tmp/db.sqlite')).toBe('unknown')
    expect(detectDbType('')).toBe('unknown')
  })
})

describe('validatePerfAgentConfigUpdate', () => {
  const base = {
    system: 'nas-dell',
    pollingIntervalSec: 5,
    blockDevices: ['sda', 'sdb'],
  }

  it('PM04 — valide une config correcte sans DBURI (existant)', () => {
    expect(() => validatePerfAgentConfigUpdate(base, true)).not.toThrow()
  })

  it('PM04b — rejette si system vide', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, system: '' }, true))
      .toThrow()
  })

  it('PM04c — rejette si system contient des caractères shell', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, system: 'nas;rm -rf' }, true))
      .toThrow()
  })

  it('PM04d — rejette si pollingIntervalSec hors plage', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, pollingIntervalSec: 4 }, true))
      .toThrow()
    expect(() => validatePerfAgentConfigUpdate({ ...base, pollingIntervalSec: 301 }, true))
      .toThrow()
  })

  it('PM04e — rejette si blockDevices vide', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, blockDevices: [] }, true))
      .toThrow()
  })

  it('PM04f — rejette un nom de device avec caractères invalides', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, blockDevices: ['sda; rm -rf /'] }, true))
      .toThrow()
  })

  it('PM04g — rejette un DBURI avec mauvais protocole', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, dburi: 'ftp://host/db' }, true))
      .toThrow()
  })

  it('PM04h — accepte postgres:// comme DBURI', () => {
    expect(() => validatePerfAgentConfigUpdate({ ...base, dburi: 'postgres://u:p@h/db' }, false))
      .not.toThrow()
  })

  it('PM05 — rejette si aucun DBURI existant et pas de dburi fourni', () => {
    expect(() => validatePerfAgentConfigUpdate(base, false))
      .toThrow()
  })
})
