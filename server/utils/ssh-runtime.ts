import { AsyncLocalStorage } from 'node:async_hooks'
import type { SSHStatus } from './ssh-session-manager'
import { getSSHManager } from './ssh-session-manager'
import type { SSHSessionManager } from './ssh-session-manager'
import { getSSHPool } from './ssh-pool'
import { getAllSans } from '../db/repositories/san.repository'

export type RuntimeSSHStatus = SSHStatus | 'unconfigured'

// ─── SAN context (per-request routing) ───────────────────────────────────────
// Allows API routes to scope SSH calls to a specific SAN without changing
// all utility function signatures.

const _sanContext = new AsyncLocalStorage<string>()

/**
 * Run `fn` with all downstream `getActiveSSHManager()` calls routed to `sanId`.
 */
export function withSanContext<T>(sanId: string, fn: () => Promise<T>): Promise<T> {
  return _sanContext.run(sanId, fn)
}

/** Returns the SAN ID currently bound to this async context, or null. */
export function getCurrentSanId(): string | null {
  return _sanContext.getStore() ?? null
}

export function hasConfiguredSSH(): boolean {
  const cfg = useRuntimeConfig()
  const envConfigured = Boolean(cfg.sshHost && cfg.sshUser)

  try {
    const hasActiveSan = getAllSans().some((san) => san.status === 'active')
    return envConfigured || hasActiveSan
  } catch {
    return envConfigured
  }
}

/**
 * Returns the best available SSH manager:
 * - If a SAN context is active (withSanContext), returns that SAN's manager.
 * - v2 mode: first connected manager from the pool, then any other
 * - v1 mode: the singleton
 * Throws if nothing is available.
 */
export function getActiveSSHManager(): SSHSessionManager {
  // Context-scoped request (e.g. dashboard with specific sanId)
  const contextSanId = _sanContext.getStore()
  if (contextSanId) {
    const pool = getSSHPool()
    const mgr = pool.get(contextSanId)
    if (mgr) return mgr
    throw new Error(`SSH pool has no manager for SAN: ${contextSanId}`)
  }

  try {
    const activeSans = getAllSans().filter((s) => s.status === 'active')
    if (activeSans.length > 0) {
      const pool = getSSHPool()
      // Prefer a connected one
      for (const san of activeSans) {
        const mgr = pool.get(san.id)
        if (mgr?.getStatus() === 'connected') return mgr
      }
      // Fall back to any manager in the pool
      for (const san of activeSans) {
        const mgr = pool.get(san.id)
        if (mgr) return mgr
      }
      throw new Error('SSH pool has no manager for active SANs')
    }
  } catch (err) {
    // If it's a real pool error, re-throw; otherwise fall through to v1
    if ((err as Error).message.startsWith('SSH pool')) throw err
  }
  // v1 singleton
  return getSSHManager()
}

export function getRuntimeSSHState(): { status: RuntimeSSHStatus; configured: boolean } {
  // Mode v2 : SANs dans le pool
  try {
    const activeSans = getAllSans().filter((s) => s.status === 'active')
    if (activeSans.length > 0) {
      const pool = getSSHPool()
      const statuses = Object.values(pool.getAllStatuses())
      if (statuses.length === 0) {
        return { status: 'connecting', configured: true }
      }
      if (statuses.some((s) => s === 'connected')) return { status: 'connected', configured: true }
      if (statuses.some((s) => s === 'reconnecting')) return { status: 'reconnecting', configured: true }
      if (statuses.some((s) => s === 'connecting')) return { status: 'connecting', configured: true }
      return { status: 'error', configured: true }
    }
  } catch {
    // ignore, fallback v1
  }

  // Mode v1 : singleton SSH
  const cfg = useRuntimeConfig()
  if (!cfg.sshHost || !cfg.sshUser) {
    return { status: 'unconfigured', configured: false }
  }

  try {
    return { status: getSSHManager().getStatus(), configured: true }
  } catch {
    return { status: 'error', configured: true }
  }
}