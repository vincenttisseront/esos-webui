import { SSHSessionManager, type SSHStatus } from './ssh-session-manager'
import { getSanWithCredentials } from '../db/repositories/san.repository'

/**
 * Pool de connexions SSH multi-SAN (cf. SDD v2.0 §8).
 *
 * Maintient une `SSHSessionManager` par `sanId` actif. Réutilise la
 * même classe que le mode v1 mono-SAN (singleton) ; le pool est
 * orthogonal et peut coexister.
 */
export class SSHPool {
  private pool = new Map<string, SSHSessionManager>()
  private creating = new Map<string, Promise<SSHSessionManager>>()

  async getOrCreate(sanId: string): Promise<SSHSessionManager> {
    const existing = this.pool.get(sanId)
    if (existing) return existing

    const inflight = this.creating.get(sanId)
    if (inflight) return inflight

    const promise = this.create(sanId).finally(() => {
      this.creating.delete(sanId)
    })
    this.creating.set(sanId, promise)
    return promise
  }

  private async create(sanId: string): Promise<SSHSessionManager> {
    const san = getSanWithCredentials(sanId)
    if (!san) throw new Error(`SAN inconnu : ${sanId}`)

    const manager = new SSHSessionManager({
      host: san.host,
      port: san.port,
      username: san.username,
      privateKey: san.privateKey ? Buffer.from(san.privateKey) : undefined,
      password: san.password,
      readyTimeout: 10_000,
    })

    manager.on('status', (status: SSHStatus) => {
      console.log(`[SSHPool] ${sanId} → ${status}`)
    })

    manager.start()
    this.pool.set(sanId, manager)
    return manager
  }

  get(sanId: string): SSHSessionManager | undefined {
    return this.pool.get(sanId)
  }

  has(sanId: string): boolean {
    return this.pool.has(sanId)
  }

  async remove(sanId: string): Promise<void> {
    const manager = this.pool.get(sanId)
    if (!manager) return
    manager.destroy()
    this.pool.delete(sanId)
  }

  getAllStatuses(): Record<string, SSHStatus> {
    const out: Record<string, SSHStatus> = {}
    for (const [id, mgr] of this.pool) {
      out[id] = mgr.getStatus()
    }
    return out
  }

  destroyAll(): void {
    for (const mgr of this.pool.values()) {
      try {
        mgr.destroy()
      } catch (err) {
        console.error('[SSHPool] destroy error:', (err as Error).message)
      }
    }
    this.pool.clear()
    this.creating.clear()
  }
}

let _pool: SSHPool | null = null

export function getSSHPool(): SSHPool {
  if (!_pool) _pool = new SSHPool()
  return _pool
}
