import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDB } from '../index'
import { sans, sanSshCredentials, sanSettings } from '../schema'
import { encrypt, decrypt, computeKeyFingerprint } from '../../utils/crypto'
import type { SanSelectionDto } from '../../utils/selection-context'

// ─── Types ──────────────────────────────────────────────────────

export type AuthType = 'key' | 'password'
export type SanStatus = 'active' | 'inactive' | 'maintenance'

export interface CreateSanInput {
  label: string
  description?: string
  host: string
  port?: number
  username: string
  driver?: string
  readOnly?: boolean
  authType: AuthType
  privateKey?: string
  password?: string
  settings?: Record<string, string>
}

export interface UpdateSanInput {
  label?: string
  description?: string | null
  host?: string
  port?: number
  username?: string
  driver?: string
  status?: SanStatus
  readOnly?: boolean
  // Credentials updates are optional ; if provided, replace the row.
  authType?: AuthType
  privateKey?: string
  password?: string
}

export interface SanSummary {
  id: string
  label: string
  description: string | null
  host: string
  port: number
  username: string
  driver: string
  status: string
  authType: AuthType
  keyFingerprint?: string
  settings: Record<string, string>
  // Cluster (SDD v3.4)
  clusterId:      string | null
  clusterEnabled: boolean
  clusterRole:    string | null
  clusterPeer:    string | null
  readOnly:       boolean
  createdAt: string
  updatedAt: string
}

export interface SanWithCredentials extends SanSummary {
  privateKey?: string
  password?: string
}

// ─── Read ───────────────────────────────────────────────────────

/**
 * Minimal SAN rows for global selection (no host, credentials, settings, etc.).
 * Used by GET /api/context/selection only — does not change getAllSans / admin APIs.
 */
export function getSansSelectionRows(): SanSelectionDto[] {
  const db = getDB()
  const rows = db
    .select({
      id:               sans.id,
      label:            sans.label,
      status:           sans.status,
      readOnly:         sans.readOnly,
      clusterId:        sans.clusterId,
      clusterEnabled:   sans.clusterEnabled,
      clusterRole:      sans.clusterRole,
      clusterPeer:      sans.clusterPeer,
    })
    .from(sans)
    .all()

  return rows.map((r) => ({
    id:               r.id,
    label:            r.label,
    status:           r.status,
    readOnly:         r.readOnly,
    clusterId:        r.clusterId ?? null,
    clusterEnabled:   r.clusterEnabled,
    clusterRole:      r.clusterRole ?? null,
    clusterPeer:      r.clusterPeer ?? null,
  }))
}

export function getAllSans(): SanSummary[] {
  const db = getDB()
  const rows = db.select().from(sans).all()

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    description: row.description,
    host: row.host,
    port: row.port,
    username: row.username,
    driver: row.driver,
    status: row.status,
    authType: (db.select().from(sanSshCredentials).where(eq(sanSshCredentials.sanId, row.id)).get()?.authType ?? 'key') as AuthType,
    keyFingerprint: db.select().from(sanSshCredentials).where(eq(sanSshCredentials.sanId, row.id)).get()?.keyFingerprint ?? undefined,
    settings: Object.fromEntries(
      db.select().from(sanSettings).where(eq(sanSettings.sanId, row.id)).all().map((s) => [s.key, s.value]),
    ),
    clusterId:      row.clusterId ?? null,
    clusterEnabled: row.clusterEnabled,
    clusterRole:    row.clusterRole ?? null,
    clusterPeer:    row.clusterPeer ?? null,
    readOnly:       row.readOnly,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
}

export function getSanWithCredentials(
  id: string,
): SanWithCredentials | null {
  const db = getDB()
  const row = db.select().from(sans).where(eq(sans.id, id)).get()
  const credentials = db.select().from(sanSshCredentials).where(eq(sanSshCredentials.sanId, id)).get()
  const settingsRows = db.select().from(sanSettings).where(eq(sanSettings.sanId, id)).all()

  if (!row || !credentials) return null

  const c = credentials

  return {
    id: row.id,
    label: row.label,
    description: row.description,
    host: row.host,
    port: row.port,
    username: row.username,
    driver: row.driver,
    status: row.status,
    authType: c.authType as AuthType,
    privateKey: c.encryptedKey ? decrypt(c.encryptedKey) : undefined,
    password: c.encryptedPassword ? decrypt(c.encryptedPassword) : undefined,
    keyFingerprint: c.keyFingerprint ?? undefined,
    settings: Object.fromEntries(
      settingsRows.map((s) => [s.key, s.value]),
    ),
    clusterId: row.clusterId ?? null,
    clusterEnabled: row.clusterEnabled,
    clusterRole:    row.clusterRole ?? null,
    clusterPeer:    row.clusterPeer ?? null,
    readOnly:       row.readOnly,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function getSanSummary(id: string): SanSummary | null {
  const full = getSanWithCredentials(id)
  if (!full) return null
  // strip secrets
  const { privateKey: _pk, password: _pw, ...summary } = full
  return summary
}

// ─── Write ──────────────────────────────────────────────────────

export function createSan(input: CreateSanInput): string {
  if (input.authType === 'key' && !input.privateKey) {
    throw new Error('privateKey requis pour authType="key"')
  }
  if (input.authType === 'password' && !input.password) {
    throw new Error('password requis pour authType="password"')
  }

  const db = getDB()
  const sanId = randomUUID()
  const now = new Date().toISOString()

  db.transaction((tx) => {
    tx.insert(sans)
      .values({
        id: sanId,
        label: input.label,
        description: input.description ?? null,
        host: input.host,
        port: input.port ?? 22,
        username: input.username,
        driver: input.driver ?? 'iscsi',
        status: 'active',
        readOnly: input.readOnly ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    tx.insert(sanSshCredentials)
      .values({
        id: randomUUID(),
        sanId,
        authType: input.authType,
        encryptedKey: input.privateKey ? encrypt(input.privateKey) : null,
        encryptedPassword: input.password ? encrypt(input.password) : null,
        keyFingerprint: input.privateKey
          ? computeKeyFingerprint(input.privateKey)
          : null,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    if (input.settings) {
      for (const [key, value] of Object.entries(input.settings)) {
        tx.insert(sanSettings)
          .values({
            id: randomUUID(),
            sanId,
            key,
            value,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      }
    }
  })

  return sanId
}

export function updateSan(id: string, input: UpdateSanInput): boolean {
  const db = getDB()
  const existing = getSanSummary(id)
  if (!existing) return false

  const now = new Date().toISOString()

  db.transaction((tx) => {
    const sanFields: Record<string, unknown> = { updatedAt: now }
    if (input.label !== undefined) sanFields.label = input.label
    if (input.description !== undefined)
      sanFields.description = input.description
    if (input.host !== undefined) sanFields.host = input.host
    if (input.port !== undefined) sanFields.port = input.port
    if (input.username !== undefined) sanFields.username = input.username
    if (input.driver !== undefined) sanFields.driver = input.driver
    if (input.status   !== undefined) sanFields.status   = input.status
    if (input.readOnly  !== undefined) sanFields.readOnly  = input.readOnly

    tx.update(sans).set(sanFields).where(eq(sans.id, id)).run()

    if (input.authType || input.privateKey || input.password) {
      const credFields: Record<string, unknown> = { updatedAt: now }
      if (input.authType) credFields.authType = input.authType
      if (input.privateKey !== undefined) {
        credFields.encryptedKey = input.privateKey
          ? encrypt(input.privateKey)
          : null
        credFields.keyFingerprint = input.privateKey
          ? computeKeyFingerprint(input.privateKey)
          : null
      }
      if (input.password !== undefined) {
        credFields.encryptedPassword = input.password
          ? encrypt(input.password)
          : null
      }
      tx.update(sanSshCredentials)
        .set(credFields)
        .where(eq(sanSshCredentials.sanId, id))
        .run()
    }
  })

  return true
}

export function updateSanStatus(id: string, status: SanStatus): void {
  const db = getDB()
  db.update(sans)
    .set({ status, updatedAt: new Date().toISOString() })
    .where(eq(sans.id, id))
    .run()
}

export function deleteSan(id: string): boolean {
  const db = getDB()
  const result = db.delete(sans).where(eq(sans.id, id)).run()
  return result.changes > 0
}

// ─── Settings helpers ───────────────────────────────────────────

export function getSanSetting(
  sanId: string,
  key: string,
  defaultValue?: string,
): string | undefined {
  const db = getDB()
  const row = db.select().from(sanSettings).where(and(eq(sanSettings.sanId, sanId), eq(sanSettings.key, key))).get()
  return row?.value ?? defaultValue
}

export function setSanSetting(
  sanId: string,
  key: string,
  value: string,
): void {
  const db = getDB()
  const now = new Date().toISOString()
  const existing = db.select().from(sanSettings).where(and(eq(sanSettings.sanId, sanId), eq(sanSettings.key, key))).get()

  if (existing) {
    db.update(sanSettings)
      .set({ value, updatedAt: now })
      .where(eq(sanSettings.id, existing.id))
      .run()
  } else {
    db.insert(sanSettings)
      .values({
        id: randomUUID(),
        sanId,
        key,
        value,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }
}
