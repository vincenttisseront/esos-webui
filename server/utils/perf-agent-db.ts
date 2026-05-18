/**
 * Adaptateurs DB PostgreSQL / MySQL pour perf-agent (SDD v3.10 §9).
 * Utilise des imports dynamiques pour éviter d'alourdir le bundle si absent.
 */
import { createError } from 'h3'
import type {
  PerfDbTestResult,
  PerfAgentSchemaMapping,
  PerfDeviceSummary,
  PerfDeviceSeries,
} from './perf-agent-types'

// Cache du schéma découvert (clé = dburi sans password)
const schemaCache = new Map<string, PerfAgentSchemaMapping>()

/** Crée un adaptateur adapté au type de DB. */
export function createPerfAgentAdapter(dburi: string): PerfAgentDbAdapter {
  if (/^postgres(ql)?:\/\//i.test(dburi)) return new PostgresPerfAgentAdapter(dburi)
  if (/^mysql:\/\//i.test(dburi)) return new MysqlPerfAgentAdapter(dburi)
  throw createError({ statusCode: 400, message: 'Type de base de données non supporté' })
}

export function invalidatePerfSchemaCache() {
  schemaCache.clear()
}

// ─── Colonnes caractéristiques ESOS perf-agent ───────────────────────────────

const REQUIRED_COLS = ['readscompleted', 'sectorsread', 'kbwritten', 'kbread', 'writespeed', 'readspeed', 'devicerate']
const STALE_THRESHOLD_MS = 15 * 60 * 1000 // 15 min

// ─── Interface adaptateur ─────────────────────────────────────────────────────

export interface PerfAgentDbAdapter {
  test(): Promise<PerfDbTestResult>
  discoverSchema(): Promise<PerfAgentSchemaMapping>
  getSystems(): Promise<string[]>
  getDevices(system: string): Promise<string[]>
  getSummary(system: string): Promise<PerfDeviceSummary[]>
  getSeries(opts: { system: string; device: string; window: string; from: number; to: number }): Promise<PerfDeviceSeries>
}

// ─── PostgreSQL ───────────────────────────────────────────────────────────────

class PostgresPerfAgentAdapter implements PerfAgentDbAdapter {
  constructor(private readonly dburi: string) {}

  private async getClient() {
    let pg: typeof import('pg')
    try {
      pg = await import('pg')
    } catch {
      throw createError({ statusCode: 500, message: 'Driver PostgreSQL (pg) non installé' })
    }
    const client = new pg.default.Client({ connectionString: this.dburi })
    await client.connect()
    return client
  }

  async test(): Promise<PerfDbTestResult> {
    const start = Date.now()
    let client: Awaited<ReturnType<typeof this.getClient>> | undefined
    try {
      client = await this.getClient()
      const latencyMs = Date.now() - start

      const tablesRes = await client.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
      )
      const tables = tablesRes.rows.map(r => r.tablename)

      // Cherche la table perf-agent
      let sampleCount: number | undefined
      let oldestSampleAt: number | undefined
      let newestSampleAt: number | undefined
      try {
        const schema = await this._discoverSchemaWith(client)
        const statsRes = await client.query<{ cnt: string; oldest: string | null; newest: string | null }>(
          `SELECT COUNT(*)::text as cnt, MIN(${schema.timestampCol}) as oldest, MAX(${schema.timestampCol}) as newest FROM "${schema.tableName}"`,
        )
        sampleCount = parseInt(statsRes.rows[0]?.cnt ?? '0', 10)
        const oldestRaw = statsRes.rows[0]?.oldest
        const newestRaw = statsRes.rows[0]?.newest
        if (oldestRaw) oldestSampleAt = new Date(oldestRaw).getTime()
        if (newestRaw) newestSampleAt = new Date(newestRaw).getTime()
      } catch { /* table not yet created */ }

      return { ok: true, dbType: 'postgres', latencyMs, tables, sampleCount, oldestSampleAt, newestSampleAt }
    } catch (err: any) {
      return { ok: false, dbType: 'postgres', latencyMs: Date.now() - start, error: err.message }
    } finally {
      await client?.end().catch(() => {})
    }
  }

  async discoverSchema(): Promise<PerfAgentSchemaMapping> {
    const cacheKey = sanitizeUriForCache(this.dburi)
    if (schemaCache.has(cacheKey)) return schemaCache.get(cacheKey)!
    const client = await this.getClient()
    try {
      const schema = await this._discoverSchemaWith(client)
      schemaCache.set(cacheKey, schema)
      return schema
    } finally {
      await client.end().catch(() => {})
    }
  }

  private async _discoverSchemaWith(client: any): Promise<PerfAgentSchemaMapping> {
    const res = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    )
    return discoverSchemaFromColumns(res.rows)
  }

  async getSystems(): Promise<string[]> {
    const schema = await this.discoverSchema()
    const client = await this.getClient()
    try {
      const res = await client.query<{ system: string }>(
        `SELECT DISTINCT "${schema.systemCol}" as system FROM "${schema.tableName}" ORDER BY system`,
      )
      return res.rows.map(r => r.system)
    } finally {
      await client.end().catch(() => {})
    }
  }

  async getDevices(system: string): Promise<string[]> {
    const schema = await this.discoverSchema()
    const client = await this.getClient()
    try {
      const res = await client.query<{ device: string }>(
        `SELECT DISTINCT "${schema.deviceCol}" as device FROM "${schema.tableName}" WHERE "${schema.systemCol}" = $1 ORDER BY device`,
        [system],
      )
      return res.rows.map(r => r.device)
    } finally {
      await client.end().catch(() => {})
    }
  }

  async getSummary(system: string): Promise<PerfDeviceSummary[]> {
    const schema = await this.discoverSchema()
    const client = await this.getClient()
    try {
      const res = await client.query(
        `SELECT DISTINCT ON ("${schema.deviceCol}")
           "${schema.deviceCol}" as device,
           "${schema.timestampCol}" as ts,
           readspeed, writespeed, devicerate,
           averagereadtime, averagewritetime, readscompleted, writescompleted
         FROM "${schema.tableName}"
         WHERE "${schema.systemCol}" = $1
         ORDER BY "${schema.deviceCol}", "${schema.timestampCol}" DESC`,
        [system],
      )
      return res.rows.map(r => rowToSummary(r, schema, system))
    } finally {
      await client.end().catch(() => {})
    }
  }

  async getSeries(opts: { system: string; device: string; window: string; from: number; to: number }): Promise<PerfDeviceSeries> {
    const schema = await this.discoverSchema()
    const client = await this.getClient()
    const { system, device, window, from, to } = opts
    try {
      const bucketSec = windowToBucketSec(window)
      let query: string
      if (bucketSec <= 60) {
        // Données brutes
        query = `
          SELECT
            EXTRACT(EPOCH FROM "${schema.timestampCol}") * 1000 as t,
            readspeed as "readKbps", writespeed as "writeKbps", devicerate as "deviceRateKbps",
            averagereadtime as "averageReadTimeMs", averagewritetime as "averageWriteTimeMs",
            readscompleted as "readsCompleted", writescompleted as "writesCompleted"
          FROM "${schema.tableName}"
          WHERE "${schema.systemCol}" = $1 AND "${schema.deviceCol}" = $2
            AND "${schema.timestampCol}" BETWEEN to_timestamp($3/1000.0) AND to_timestamp($4/1000.0)
          ORDER BY "${schema.timestampCol}"`
      } else {
        // Agrégation par bucket
        query = `
          SELECT
            FLOOR(EXTRACT(EPOCH FROM "${schema.timestampCol}") / ${bucketSec}) * ${bucketSec} * 1000 as t,
            AVG(readspeed) as "readKbps", AVG(writespeed) as "writeKbps", AVG(devicerate) as "deviceRateKbps",
            AVG(averagereadtime) as "averageReadTimeMs", AVG(averagewritetime) as "averageWriteTimeMs",
            SUM(readscompleted) as "readsCompleted", SUM(writescompleted) as "writesCompleted"
          FROM "${schema.tableName}"
          WHERE "${schema.systemCol}" = $1 AND "${schema.deviceCol}" = $2
            AND "${schema.timestampCol}" BETWEEN to_timestamp($3/1000.0) AND to_timestamp($4/1000.0)
          GROUP BY 1 ORDER BY 1`
      }
      const res = await client.query(query, [system, device, from, to])
      return { system, device, window: window as PerfDeviceSeries['window'], points: res.rows.map(rowToPoint) }
    } finally {
      await client.end().catch(() => {})
    }
  }
}

// ─── MySQL ────────────────────────────────────────────────────────────────────

class MysqlPerfAgentAdapter implements PerfAgentDbAdapter {
  constructor(private readonly dburi: string) {}

  private async getConnection() {
    let mysql2: typeof import('mysql2/promise')
    try {
      mysql2 = await import('mysql2/promise')
    } catch {
      throw createError({ statusCode: 500, message: 'Driver MySQL (mysql2) non installé' })
    }
    const conn = await mysql2.createConnection(this.dburi)
    return conn
  }

  async test(): Promise<PerfDbTestResult> {
    const start = Date.now()
    let conn: Awaited<ReturnType<typeof this.getConnection>> | undefined
    try {
      conn = await this.getConnection()
      const latencyMs = Date.now() - start

      const [tablesRows] = await conn.query<any[]>('SHOW TABLES')
      const tables: string[] = tablesRows.map((r: any) => Object.values(r)[0] as string)

      let sampleCount: number | undefined
      let oldestSampleAt: number | undefined
      let newestSampleAt: number | undefined
      try {
        const schema = await this._discoverSchemaWith(conn)
        const [statsRows] = await conn.query<any[]>(
          `SELECT COUNT(*) as cnt, MIN(\`${schema.timestampCol}\`) as oldest, MAX(\`${schema.timestampCol}\`) as newest FROM \`${schema.tableName}\``,
        )
        sampleCount = parseInt(statsRows[0]?.cnt ?? '0', 10)
        if (statsRows[0]?.oldest) oldestSampleAt = new Date(statsRows[0].oldest).getTime()
        if (statsRows[0]?.newest) newestSampleAt = new Date(statsRows[0].newest).getTime()
      } catch { /* table not yet created */ }

      return { ok: true, dbType: 'mysql', latencyMs, tables, sampleCount, oldestSampleAt, newestSampleAt }
    } catch (err: any) {
      return { ok: false, dbType: 'mysql', latencyMs: Date.now() - start, error: err.message }
    } finally {
      await conn?.end().catch(() => {})
    }
  }

  async discoverSchema(): Promise<PerfAgentSchemaMapping> {
    const cacheKey = sanitizeUriForCache(this.dburi)
    if (schemaCache.has(cacheKey)) return schemaCache.get(cacheKey)!
    const conn = await this.getConnection()
    try {
      const schema = await this._discoverSchemaWith(conn)
      schemaCache.set(cacheKey, schema)
      return schema
    } finally {
      await conn.end().catch(() => {})
    }
  }

  private async _discoverSchemaWith(conn: any): Promise<PerfAgentSchemaMapping> {
    const [rows] = await conn.query<any[]>(
      `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
    )
    return discoverSchemaFromColumns(rows)
  }

  async getSystems(): Promise<string[]> {
    const schema = await this.discoverSchema()
    const conn = await this.getConnection()
    try {
      const [rows] = await conn.query<any[]>(
        `SELECT DISTINCT \`${schema.systemCol}\` as system FROM \`${schema.tableName}\` ORDER BY system`,
      )
      return rows.map((r: any) => r.system)
    } finally {
      await conn.end().catch(() => {})
    }
  }

  async getDevices(system: string): Promise<string[]> {
    const schema = await this.discoverSchema()
    const conn = await this.getConnection()
    try {
      const [rows] = await conn.query<any[]>(
        `SELECT DISTINCT \`${schema.deviceCol}\` as device FROM \`${schema.tableName}\` WHERE \`${schema.systemCol}\` = ? ORDER BY device`,
        [system],
      )
      return rows.map((r: any) => r.device)
    } finally {
      await conn.end().catch(() => {})
    }
  }

  async getSummary(system: string): Promise<PerfDeviceSummary[]> {
    const schema = await this.discoverSchema()
    const conn = await this.getConnection()
    try {
      // MySQL n'a pas DISTINCT ON — on group + MAX(ts) puis rejoint
      const [rows] = await conn.query<any[]>(
        `SELECT t.* FROM \`${schema.tableName}\` t
         INNER JOIN (
           SELECT \`${schema.deviceCol}\`, MAX(\`${schema.timestampCol}\`) as mts
           FROM \`${schema.tableName}\` WHERE \`${schema.systemCol}\` = ?
           GROUP BY \`${schema.deviceCol}\`
         ) latest ON t.\`${schema.deviceCol}\` = latest.\`${schema.deviceCol}\` AND t.\`${schema.timestampCol}\` = latest.mts
         WHERE t.\`${schema.systemCol}\` = ?`,
        [system, system],
      )
      return rows.map((r: any) => rowToSummary(r, schema, system))
    } finally {
      await conn.end().catch(() => {})
    }
  }

  async getSeries(opts: { system: string; device: string; window: string; from: number; to: number }): Promise<PerfDeviceSeries> {
    const schema = await this.discoverSchema()
    const conn = await this.getConnection()
    const { system, device, window, from, to } = opts
    const fromSec = Math.floor(from / 1000)
    const toSec = Math.floor(to / 1000)
    try {
      const bucketSec = windowToBucketSec(window)
      let query: string
      if (bucketSec <= 60) {
        query = `
          SELECT UNIX_TIMESTAMP(\`${schema.timestampCol}\`) * 1000 as t,
            readspeed as readKbps, writespeed as writeKbps, devicerate as deviceRateKbps,
            averagereadtime as averageReadTimeMs, averagewritetime as averageWriteTimeMs,
            readscompleted as readsCompleted, writescompleted as writesCompleted
          FROM \`${schema.tableName}\`
          WHERE \`${schema.systemCol}\` = ? AND \`${schema.deviceCol}\` = ?
            AND UNIX_TIMESTAMP(\`${schema.timestampCol}\`) BETWEEN ? AND ?
          ORDER BY \`${schema.timestampCol}\``
      } else {
        query = `
          SELECT FLOOR(UNIX_TIMESTAMP(\`${schema.timestampCol}\`) / ${bucketSec}) * ${bucketSec} * 1000 as t,
            AVG(readspeed) as readKbps, AVG(writespeed) as writeKbps, AVG(devicerate) as deviceRateKbps,
            AVG(averagereadtime) as averageReadTimeMs, AVG(averagewritetime) as averageWriteTimeMs,
            SUM(readscompleted) as readsCompleted, SUM(writescompleted) as writesCompleted
          FROM \`${schema.tableName}\`
          WHERE \`${schema.systemCol}\` = ? AND \`${schema.deviceCol}\` = ?
            AND UNIX_TIMESTAMP(\`${schema.timestampCol}\`) BETWEEN ? AND ?
          GROUP BY 1 ORDER BY 1`
      }
      const [rows] = await conn.query<any[]>(query, [system, device, fromSec, toSec])
      return { system, device, window: window as PerfDeviceSeries['window'], points: (rows as any[]).map(rowToPoint) }
    } finally {
      await conn.end().catch(() => {})
    }
  }
}

// ─── Découverte du schéma ─────────────────────────────────────────────────────

function discoverSchemaFromColumns(rows: Array<{ table_name: string; column_name: string }>): PerfAgentSchemaMapping {
  // Regrouper par table
  const tableColumns = new Map<string, Set<string>>()
  for (const row of rows) {
    const cols = tableColumns.get(row.table_name) ?? new Set<string>()
    cols.add(row.column_name.toLowerCase())
    tableColumns.set(row.table_name, cols)
  }

  // Trouver la table qui contient toutes les colonnes requises
  for (const [tableName, cols] of tableColumns.entries()) {
    if (REQUIRED_COLS.every(c => cols.has(c))) {
      // Identifier les colonnes timestamp / system / device
      const timestampCol = findCol(cols, ['timestamp', 'ts', 'time', 'created_at', 'sampletime']) ?? 'timestamp'
      const systemCol = findCol(cols, ['system', 'host', 'hostname', 'server']) ?? 'system'
      const deviceCol = findCol(cols, ['device', 'blockdevice', 'block_device', 'dev']) ?? 'device'
      return { tableName, timestampCol, systemCol, deviceCol }
    }
  }
  throw createError({ statusCode: 422, message: 'Aucune table perf-agent trouvée dans la base. Vérifiez la configuration DBURI et que l\'agent a démarré au moins une fois.' })
}

function findCol(cols: Set<string>, candidates: string[]): string | undefined {
  return candidates.find(c => cols.has(c))
}

// ─── Row → type ───────────────────────────────────────────────────────────────

function rowToSummary(r: any, schema: PerfAgentSchemaMapping, system: string): PerfDeviceSummary {
  const lastSampleAt = r.ts instanceof Date ? r.ts.getTime() : (Number(r.ts) || 0)
  const readKbps = Number(r.readspeed ?? r.readKbps ?? 0)
  const writeKbps = Number(r.writespeed ?? r.writeKbps ?? 0)
  const deviceRateKbps = Number(r.devicerate ?? r.deviceRateKbps ?? 0)
  const stale = Date.now() - lastSampleAt > STALE_THRESHOLD_MS
  const active = readKbps + writeKbps > 0

  let status: PerfDeviceSummary['status'] = 'unknown'
  if (lastSampleAt === 0) status = 'unknown'
  else if (stale) status = 'stale'
  else if (deviceRateKbps > 50_000) status = 'hot'
  else if (active) status = 'active'
  else status = 'idle'

  return {
    system,
    device: String(r[schema.deviceCol] ?? r.device ?? ''),
    lastSampleAt,
    readKbps,
    writeKbps,
    deviceRateKbps,
    averageReadTimeMs: Number(r.averagereadtime ?? r.averageReadTimeMs ?? 0),
    averageWriteTimeMs: Number(r.averagewritetime ?? r.averageWriteTimeMs ?? 0),
    readsCompleted: Number(r.readscompleted ?? r.readsCompleted ?? 0),
    writesCompleted: Number(r.writescompleted ?? r.writesCompleted ?? 0),
    status,
  }
}

function rowToPoint(r: any) {
  return {
    t: Number(r.t),
    readKbps: Number(r.readKbps ?? r.readspeed ?? 0),
    writeKbps: Number(r.writeKbps ?? r.writespeed ?? 0),
    deviceRateKbps: Number(r.deviceRateKbps ?? r.devicerate ?? 0),
    averageReadTimeMs: Number(r.averageReadTimeMs ?? r.averagereadtime ?? 0),
    averageWriteTimeMs: Number(r.averageWriteTimeMs ?? r.averagewritetime ?? 0),
    readsCompleted: Number(r.readsCompleted ?? r.readscompleted ?? 0),
    writesCompleted: Number(r.writesCompleted ?? r.writescompleted ?? 0),
  }
}

function windowToBucketSec(window: string): number {
  switch (window) {
    case '15m': return 0   // brut
    case '1h':  return 0   // brut
    case '6h':  return 60  // 1 min
    case '24h': return 300 // 5 min
    case '7d':  return 3600 // 1h
    case '31d': return 86400 // 1 jour
    default:    return 0
  }
}

function windowToMs(window: string): number {
  switch (window) {
    case '15m': return 15 * 60_000
    case '1h':  return 60 * 60_000
    case '6h':  return 6 * 60 * 60_000
    case '24h': return 24 * 60 * 60_000
    case '7d':  return 7 * 24 * 60 * 60_000
    case '31d': return 31 * 24 * 60 * 60_000
    default:    return 60 * 60_000
  }
}

export { windowToMs }

function sanitizeUriForCache(uri: string): string {
  return uri.replace(/(:\/\/[^:]+:)[^@]+(@)/, '$1***$2')
}
