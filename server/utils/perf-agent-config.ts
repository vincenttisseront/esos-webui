/**
 * Lecture, parsing et écriture de /etc/perf-agent.con (SDD v3.10 §5.1).
 */
import { createError } from 'h3'
import type { SSHSessionManager } from './ssh-session-manager'
import type { PerfAgentConfig, PerfAgentConfigUpdate } from './perf-agent-types'

const PERF_AGENT_CONF = '/etc/perf-agent.con'

/** Lit et parse /etc/perf-agent.con depuis une session SSH. */
export async function readPerfAgentConfig(manager: SSHSessionManager): Promise<PerfAgentConfig> {
  const { stdout } = await manager.exec(
    `cat "${PERF_AGENT_CONF}" 2>/dev/null; echo "---EXISTS:$?"`,
    10_000,
  )

  const existsMatch = stdout.match(/---EXISTS:(\d+)$/)
  const rawExists = existsMatch?.[1] === '0'
  const content = stdout.replace(/---EXISTS:\d+\n?$/, '')

  const raw = parseConFile(content)
  const dburi = raw.DBURI ?? ''

  return {
    dburiMasked: maskDbUri(dburi),
    dbType: detectDbType(dburi),
    dbHost: extractDbHost(dburi),
    dbName: extractDbName(dburi),
    system: raw.System ?? '',
    hostAddress: raw.HostAddress ?? '',
    pollingIntervalSec: parseInt(raw.PollingInterval ?? '5', 10) || 5,
    blockDevices: (raw.BlockDevices ?? '').split(/\s+/).filter(Boolean),
    rawExists,
    updatedAt: Date.now(),
  }
}

/** Écrit /etc/perf-agent.con sur la machine distante via base64. */
export async function writePerfAgentConfig(
  manager: SSHSessionManager,
  update: PerfAgentConfigUpdate,
  existingDbUri?: string,
): Promise<void> {
  const dburi = update.dburi ?? existingDbUri ?? ''
  const blockDevices = update.blockDevices
    .map(d => d.replace(/^\/dev\//, '').replace(/[^a-zA-Z0-9_./-]/g, ''))
    .filter(Boolean)
    .join(' ')

  const lines = [
    `DBURI = ${dburi}`,
    `System = ${update.system}`,
    `HostAddress = ${update.hostAddress ?? ''}`,
    `PollingInterval = ${update.pollingIntervalSec}`,
    `BlockDevices = ${blockDevices}`,
  ].join('\n') + '\n'

  const b64 = Buffer.from(lines).toString('base64')
  const cmd = [
    `cp -f "${PERF_AGENT_CONF}" "${PERF_AGENT_CONF}.bak" 2>/dev/null || true`,
    `echo "${b64}" | base64 -d > "${PERF_AGENT_CONF}"`,
    'conf_sync.sh 2>/dev/null || true',
  ].join(' && ')

  await manager.exec(cmd, 20_000)
}

/** Lit le DBURI brut (non masqué) depuis /etc/perf-agent.con. */
export async function readRawDbUri(manager: SSHSessionManager): Promise<string> {
  const { stdout } = await manager.exec(
    `grep -i "^DBURI" "${PERF_AGENT_CONF}" 2>/dev/null | head -1`,
    5_000,
  )
  const match = stdout.match(/^DBURI\s*=\s*(.+)$/im)
  return match?.[1]?.trim() ?? ''
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseConFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    result[key] = val
  }
  return result
}

export function maskDbUri(dburi: string): string {
  // postgres://user:password@host/db → postgres://user:********@host/db
  return dburi.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1********$3')
}

export function detectDbType(dburi: string): 'postgres' | 'mysql' | 'unknown' {
  if (/^postgres(ql)?:\/\//i.test(dburi)) return 'postgres'
  if (/^mysql:\/\//i.test(dburi)) return 'mysql'
  return 'unknown'
}

function extractDbHost(dburi: string): string {
  const match = dburi.match(/@([^/]+)\//)
  return match?.[1] ?? ''
}

function extractDbName(dburi: string): string {
  const match = dburi.match(/\/([^/?]+)\s*$/)
  return match?.[1] ?? ''
}

/** Validation avant écriture (SDD v3.10 §8.2). */
export function validatePerfAgentConfigUpdate(
  body: PerfAgentConfigUpdate,
  hasExistingDbUri: boolean,
): void {
  if (!body.system?.trim()) {
    throw createError({ statusCode: 400, message: 'system est requis' })
  }
  if (/[;&|`$\\]/.test(body.system)) {
    throw createError({ statusCode: 400, message: 'system contient des caractères interdits' })
  }
  const interval = body.pollingIntervalSec
  if (!Number.isInteger(interval) || interval < 5 || interval > 300) {
    throw createError({ statusCode: 400, message: 'pollingIntervalSec doit être entre 5 et 300' })
  }
  if (!body.blockDevices?.length) {
    throw createError({ statusCode: 400, message: 'blockDevices ne peut pas être vide' })
  }
  const devicePattern = /^[a-zA-Z0-9_./-]+$/
  for (const d of body.blockDevices) {
    if (!devicePattern.test(d)) {
      throw createError({ statusCode: 400, message: `Nom de device invalide: ${d}` })
    }
  }
  if (body.dburi) {
    if (!/^(postgres(ql)?|mysql):\/\//i.test(body.dburi)) {
      throw createError({
        statusCode: 400,
        message: 'dburi doit commencer par postgres://, postgresql:// ou mysql://',
      })
    }
  } else if (!hasExistingDbUri) {
    throw createError({ statusCode: 400, message: 'dburi requis (aucune configuration existante)' })
  }
}
