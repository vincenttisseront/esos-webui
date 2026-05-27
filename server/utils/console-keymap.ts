import { getSSHPool } from './ssh-pool'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import { writeRemoteFileAtomicOrThrow } from './remote-file-writer'
import type { SSHSessionManager } from './ssh-session-manager'

export const RC_KEYMAP_PATH = '/etc/rc.d/rc.keymap'
const KEYMAP_ROOT = '/usr/share/kbd/keymaps'
const MISSING = '__MISSING__'

export type ConsoleKeymapItem = {
  id: string
  label: string
}

export type ConsoleKeymapStatus =
  | { status: 'ok'; data: ConsoleKeymapInfo }
  | { status: 'unavailable'; error: { code: string; message: string } }

export type ConsoleKeymapInfo = {
  current: { id: string } | null
  available: ConsoleKeymapItem[]
  loadkeysPresent: boolean
  rcKeymapPresent: boolean
}

export function normalizeKeymapId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const base = raw.split('/').pop() ?? raw
  return base
    .replace(/\.map\.gz$/i, '')
    .replace(/\.map$/i, '')
    .trim() || null
}

export function validateKeymapId(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Keymap vide'
  if (v.length > 64) return 'Keymap trop long'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(v)) return 'Keymap invalide'
  return null
}

export function parseRcKeymap(content: string): { id: string } | null {
  const lines = content.split('\n')
  let lastArg: string | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const m = trimmed.match(/\bloadkeys\b\s+(.+?)\s*(?:#.*)?$/)
    if (!m) continue
    const argRaw = m[1].trim()
    if (!argRaw) continue
    const arg = stripOuterQuotes(argRaw)
    lastArg = arg
  }
  const id = lastArg ? normalizeKeymapId(lastArg) : null
  return id ? { id } : null
}

function stripOuterQuotes(v: string): string {
  const s = v.trim()
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1)
  }
  return s
}

export function serializeRcKeymap(keymapId: string): string {
  const q = shellSingleQuoteForRemote(keymapId)
  return [
    '#!/bin/sh',
    '# Managed by ESOS WebUI — console keymap (TTY only)',
    'if command -v loadkeys >/dev/null 2>&1; then',
    `  loadkeys ${q} 2>/dev/null || loadkeys ${q}`,
    'fi',
    '',
  ].join('\n')
}

export function buildLoadkeysCommand(keymapId: string): string {
  const q = shellSingleQuoteForRemote(keymapId)
  return `command -v loadkeys >/dev/null 2>&1 && loadkeys ${q}`
}

async function readRcKeymap(manager: SSHSessionManager): Promise<string | null> {
  const { stdout } = await manager.exec(`cat ${shellSingleQuoteForRemote(RC_KEYMAP_PATH)} 2>/dev/null || echo ${MISSING}`, 10_000)
  const raw = stdout.trimEnd()
  if (raw === MISSING) return null
  return raw
}

async function discoverKeymaps(manager: SSHSessionManager): Promise<ConsoleKeymapItem[]> {
  const { stdout } = await manager.exec(
    `if [ -d ${shellSingleQuoteForRemote(KEYMAP_ROOT)} ]; then ` +
    `find ${shellSingleQuoteForRemote(KEYMAP_ROOT)} -type f \\( -name '*.map' -o -name '*.map.gz' \\) 2>/dev/null; ` +
    `fi`,
    25_000,
  )
  const ids = new Set<string>()
  for (const line of stdout.split('\n')) {
    const id = normalizeKeymapId(line)
    if (id) ids.add(id)
  }
  return Array.from(ids)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, label: id }))
}

export async function readConsoleKeymapInfo(sanId: string): Promise<ConsoleKeymapStatus> {
  const pool = getSSHPool()
  const manager = pool.get(sanId)
  if (!manager || !manager.isReady()) {
    return {
      status: 'unavailable',
      error: { code: 'SSH_DOWN', message: `SSH non connecté (${manager?.getStatus() ?? 'error'})` },
    }
  }

  try {
    const [loadkeysCheck, rc, available] = await Promise.all([
      manager.exec('command -v loadkeys >/dev/null 2>&1 && echo yes || echo no', 8_000),
      readRcKeymap(manager),
      discoverKeymaps(manager),
    ])
    const loadkeysPresent = loadkeysCheck.stdout.trim() === 'yes'
    const current = rc ? parseRcKeymap(rc) : null
    return {
      status: 'ok',
      data: {
        current,
        available,
        loadkeysPresent,
        rcKeymapPresent: Boolean(rc),
      },
    }
  } catch (err: any) {
    return {
      status: 'unavailable',
      error: { code: 'SSH_ERROR', message: err?.message ?? 'Erreur inattendue' },
    }
  }
}

export async function testConsoleKeymapTemporary(sanId: string, keymapId: string): Promise<void> {
  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  await manager.exec(buildLoadkeysCommand(keymapId), 15_000)
}

export async function saveAndApplyConsoleKeymap(sanId: string, keymapId: string): Promise<void> {
  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)

  const script = serializeRcKeymap(keymapId)
  await writeRemoteFileAtomicOrThrow(manager, RC_KEYMAP_PATH, script, {
    logTag: 'rc.keymap',
    errorPrefix: 'Écriture rc.keymap',
  })

  // Ensure executable bit; ignore errors (some images may not care).
  await manager.exec(`chmod +x ${shellSingleQuoteForRemote(RC_KEYMAP_PATH)} 2>/dev/null || true`, 8_000)

  // Apply immediately.
  await manager.exec(buildLoadkeysCommand(keymapId), 15_000)

  // Persist to ESOS conf media when available.
  await manager.exec('conf_sync.sh 2>/dev/null || true', 30_000)
}

