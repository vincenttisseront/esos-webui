import { getSSHPool } from './ssh-pool'
import { shellSingleQuoteForRemote } from './remote-config-paths'
import { writeRemoteFileAtomicOrThrow } from './remote-file-writer'
import type { SSHSessionManager } from './ssh-session-manager'

export const RC_KEYMAP_PATH = '/etc/rc.d/rc.keymap'
const KEYMAP_ROOTS = ['/usr/share/kbd/keymaps', '/lib/kbd/keymaps']
const MISSING = '__MISSING__'

export const FALLBACK_CONSOLE_KEYMAPS = [
  'us',
  'fr',
  'fr-latin9',
  'be',
  'de',
  'de-latin1',
  'es',
  'it',
  'uk',
  'pt',
  'ch',
  'ru',
] as const

export type ConsoleKeymapItem = {
  id: string
  label: string
  source?: 'detected' | 'fallback'
}

export type ConsoleKeymapStatus =
  | { status: 'ok'; data: ConsoleKeymapInfo }
  | { status: 'unavailable'; error: { code: string; message: string } }

export type ConsoleKeymapInfo = {
  current: { id: string } | null
  available: ConsoleKeymapItem[]
  loadkeysPresent: boolean
  rcKeymapPresent: boolean
  usingFallback: boolean
  detectedCount: number
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

/** Merge detected keymaps with current + static fallback list. */
export function mergeKeymapLists(
  detected: ConsoleKeymapItem[],
  current: { id: string } | null,
): { available: ConsoleKeymapItem[]; detectedCount: number; usingFallback: boolean } {
  const detectedCount = detected.length
  const byId = new Map<string, ConsoleKeymapItem>()

  for (const item of detected) {
    byId.set(item.id, { ...item, source: 'detected' })
  }

  if (current?.id && !byId.has(current.id)) {
    byId.set(current.id, { id: current.id, label: current.id, source: 'detected' })
  }

  let usingFallback = false
  for (const id of FALLBACK_CONSOLE_KEYMAPS) {
    if (!byId.has(id)) {
      byId.set(id, { id, label: id, source: 'fallback' })
      usingFallback = true
    }
  }

  if (detectedCount === 0) {
    usingFallback = true
  }

  const available = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id))
  return { available, detectedCount, usingFallback }
}

export function isKeymapAllowed(keymapId: string, info: ConsoleKeymapInfo): boolean {
  if (validateKeymapId(keymapId)) return false
  return info.available.some(k => k.id === keymapId)
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

export function buildLoadkeysCommand(keymapId: string, resolvedPath?: string | null): string {
  const arg = resolvedPath?.trim() || keymapId
  const q = shellSingleQuoteForRemote(arg)
  return `command -v loadkeys >/dev/null 2>&1 && loadkeys ${q}`
}

async function readRcKeymap(manager: SSHSessionManager): Promise<string | null> {
  const { stdout } = await manager.exec(`cat ${shellSingleQuoteForRemote(RC_KEYMAP_PATH)} 2>/dev/null || echo ${MISSING}`, 10_000)
  const raw = stdout.trimEnd()
  if (raw === MISSING) return null
  return raw
}

function parseProbeStdout(stdout: string): string[] {
  const ids: string[] = []
  for (const line of stdout.split('\n')) {
    const id = normalizeKeymapId(line.trim())
    if (id) ids.push(id)
  }
  return ids
}

async function discoverKeymapsFromFind(manager: SSHSessionManager): Promise<string[]> {
  const roots = KEYMAP_ROOTS.map(r => shellSingleQuoteForRemote(r)).join(' ')
  const { stdout } = await manager.exec(
    `for d in ${roots}; do ` +
    `if [ -d "$d" ]; then find "$d" -type f \\( -name '*.map' -o -name '*.map.gz' \\) 2>/dev/null; fi; ` +
    `done`,
    25_000,
  )
  return parseProbeStdout(stdout)
}

async function discoverKeymapsFromLoadkeysList(manager: SSHSessionManager): Promise<string[]> {
  const { stdout, code } = await manager.exec('loadkeys -l 2>/dev/null || loadkeys -L 2>/dev/null || true', 12_000)
  if (code !== 0 && !stdout.trim()) return []
  return parseProbeStdout(stdout)
}

async function discoverKeymapsFromLocalectl(manager: SSHSessionManager): Promise<string[]> {
  const { stdout, code } = await manager.exec('localectl list-keymaps 2>/dev/null || true', 12_000)
  if (code !== 0 && !stdout.trim()) return []
  return parseProbeStdout(stdout)
}

async function discoverKeymapsDetected(manager: SSHSessionManager): Promise<ConsoleKeymapItem[]> {
  const ids = new Set<string>()
  const probes = [
    discoverKeymapsFromFind(manager),
    discoverKeymapsFromLoadkeysList(manager),
    discoverKeymapsFromLocalectl(manager),
  ]
  const results = await Promise.allSettled(probes)
  for (const r of results) {
    if (r.status === 'fulfilled') {
      for (const id of r.value) ids.add(id)
    }
  }
  return Array.from(ids)
    .sort((a, b) => a.localeCompare(b))
    .map(id => ({ id, label: id, source: 'detected' as const }))
}

/** Find first keymap file path on remote for a short id. */
export async function resolveKeymapFile(
  manager: SSHSessionManager,
  keymapId: string,
): Promise<string | null> {
  const err = validateKeymapId(keymapId)
  if (err) return null

  const safeId = keymapId.replace(/[^a-zA-Z0-9._-]/g, '')
  const roots = KEYMAP_ROOTS.map(r => shellSingleQuoteForRemote(r)).join(' ')
  const { stdout } = await manager.exec(
    `for d in ${roots}; do ` +
    `if [ -d "$d" ]; then ` +
    `find "$d" -type f \\( -name '${safeId}.map' -o -name '${safeId}.map.gz' -o -path '*/${safeId}.map' -o -path '*/${safeId}.map.gz' \\) 2>/dev/null | head -1; ` +
    `fi; ` +
    `done`,
    20_000,
  )
  const line = stdout.split('\n').map(l => l.trim()).find(Boolean)
  return line ?? null
}

export async function readConsoleKeymapInfo(sanId: string): Promise<ConsoleKeymapStatus> {
  const pool = getSSHPool()
  try {
    const manager = await pool.getOrCreate(sanId)
    if (!manager.isReady()) {
      return {
        status: 'unavailable',
        error: { code: 'SSH_DOWN', message: `SSH non connecté (${manager.getStatus()})` },
      }
    }

    const [loadkeysCheck, rc, detected] = await Promise.all([
      manager.exec('command -v loadkeys >/dev/null 2>&1 && echo yes || echo no', 8_000),
      readRcKeymap(manager),
      discoverKeymapsDetected(manager),
    ])
    const loadkeysPresent = loadkeysCheck.stdout.trim() === 'yes'
    const current = rc ? parseRcKeymap(rc) : null
    const { available, detectedCount, usingFallback } = mergeKeymapLists(detected, current)

    return {
      status: 'ok',
      data: {
        current,
        available,
        loadkeysPresent,
        rcKeymapPresent: Boolean(rc),
        usingFallback,
        detectedCount,
      },
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue'
    return {
      status: 'unavailable',
      error: { code: 'SSH_ERROR', message },
    }
  }
}

async function applyKeymapTemporary(manager: SSHSessionManager, keymapId: string): Promise<void> {
  const resolved = await resolveKeymapFile(manager, keymapId)
  const result = await manager.exec(buildLoadkeysCommand(keymapId, resolved), 15_000)
  if (result.code !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || `loadkeys exit ${result.code}`)
  }
}

export async function testConsoleKeymapTemporary(sanId: string, keymapId: string): Promise<void> {
  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  await applyKeymapTemporary(manager, keymapId)
}

export async function saveAndApplyConsoleKeymap(sanId: string, keymapId: string): Promise<void> {
  const pool = getSSHPool()
  const manager = await pool.getOrCreate(sanId)

  const script = serializeRcKeymap(keymapId)
  await writeRemoteFileAtomicOrThrow(manager, RC_KEYMAP_PATH, script, {
    logTag: 'rc.keymap',
    errorPrefix: 'Écriture rc.keymap',
  })

  await manager.exec(`chmod +x ${shellSingleQuoteForRemote(RC_KEYMAP_PATH)} 2>/dev/null || true`, 8_000)

  await applyKeymapTemporary(manager, keymapId)

  await manager.exec('conf_sync.sh 2>/dev/null || true', 30_000)
}
