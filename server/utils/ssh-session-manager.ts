import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { EventEmitter } from 'node:events'

/**
 * SSHSessionManager — single persistent TCP SSH connection multiplexed
 * into N exec channels and (optionally) shell channels (cf. SDD v1.4 §4-5).
 */

export type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface ExecResult {
  stdout: string
  stderr: string
  code: number
}

interface QueuedCommand {
  cmd: string
  timeoutMs: number
  resolve: (result: ExecResult) => void
  reject: (err: Error) => void
}

export class SSHSessionManager extends EventEmitter {
  private client: Client | null = null
  private config: ConnectConfig
  private status: SSHStatus = 'connecting'
  private retryCount = 0
  private readonly maxRetries = 10
  private readonly baseRetryDelay = 3_000
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private queue: QueuedCommand[] = []
  private destroyed = false

  // Channel concurrency throttling (cf. SDD v1.4 §11.1)
  private activeChannels = 0
  private readonly maxChannels = 10
  private waiters: Array<() => void> = []

  constructor(config: ConnectConfig) {
    super()
    this.config = config
  }

  // ─── Lifecycle ─────────────────────────────────────────────────

  start(): void {
    this.destroyed = false
    this.connect()
  }

  destroy(): void {
    this.destroyed = true
    this.clearKeepalive()
    try {
      this.client?.end()
    } catch {
      /* ignore */
    }
    this.client = null
    this.setStatus('error')
    this.drainQueue(new Error('SSHSessionManager destroyed'))
    // Release any concurrency waiters
    for (const w of this.waiters.splice(0)) w()
  }

  // ─── Connection ────────────────────────────────────────────────

  private connect(): void {
    if (this.destroyed) return
    this.setStatus(this.retryCount > 0 ? 'reconnecting' : 'connecting')

    const client = new Client()
    this.client = client

    client.on('ready', () => {
      this.retryCount = 0
      this.setStatus('connected')
      this.startKeepalive()
      this.flushQueue()
    })

    client.on('error', (err: Error) => {
      console.error('[SSH] Connection error:', err.message)
      // 'close' will follow and trigger reconnect
    })

    client.on('close', () => {
      if (!this.destroyed) {
        console.warn('[SSH] Connection closed, scheduling reconnect…')
        this.scheduleReconnect()
      }
    })

    try {
      client.connect({
        ...this.config,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
        readyTimeout: this.config.readyTimeout ?? 10_000,
      })
    } catch (err) {
      console.error('[SSH] connect() threw:', (err as Error).message)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    this.clearKeepalive()
    this.client = null

    if (this.retryCount >= this.maxRetries) {
      this.setStatus('error')
      this.drainQueue(
        new Error(`SSH: max reconnect attempts reached (${this.maxRetries})`),
      )
      return
    }

    const delay = Math.min(
      this.baseRetryDelay * Math.pow(2, this.retryCount),
      60_000,
    )
    this.retryCount++
    console.log(
      `[SSH] Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`,
    )
    setTimeout(() => this.connect(), delay)
  }

  // ─── Keepalive (application-level) ─────────────────────────────

  private startKeepalive(): void {
    this.clearKeepalive()
    this.keepAliveTimer = setInterval(() => {
      if (this.status !== 'connected') return
      this.exec('true', 5_000).catch(() => {
        /* failure → 'close' event will trigger reconnect */
      })
    }, 60_000)
  }

  private clearKeepalive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  // ─── Queue ─────────────────────────────────────────────────────

  private flushQueue(): void {
    const pending = this.queue.splice(0)
    for (const item of pending) {
      this.runExec(item.cmd, item.timeoutMs, item.resolve, item.reject)
    }
  }

  private drainQueue(err: Error): void {
    const pending = this.queue.splice(0)
    for (const item of pending) item.reject(err)
  }

  // ─── Channel concurrency ───────────────────────────────────────

  private async acquireSlot(): Promise<void> {
    if (this.activeChannels < this.maxChannels) {
      this.activeChannels++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.activeChannels++
  }

  private releaseSlot(): void {
    this.activeChannels--
    const next = this.waiters.shift()
    if (next) next()
  }

  // ─── Public API: exec ──────────────────────────────────────────

  getStatus(): SSHStatus {
    return this.status
  }

  isReady(): boolean {
    return this.status === 'connected' && !this.destroyed
  }

  exec(cmd: string, timeoutMs = 30_000): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      if (this.destroyed || this.status === 'error') {
        reject(new Error('SSH: connection in error state'))
        return
      }
      if (this.status === 'connected' && this.client) {
        this.runExec(cmd, timeoutMs, resolve, reject)
      } else {
        this.queue.push({ cmd, timeoutMs, resolve, reject })
      }
    })
  }

  private async runExec(
    cmd: string,
    timeoutMs: number,
    resolve: (r: ExecResult) => void,
    reject: (e: Error) => void,
  ): Promise<void> {
    if (!this.client) {
      reject(new Error('SSH: no client'))
      return
    }

    await this.acquireSlot()
    let released = false
    const release = () => {
      if (!released) {
        released = true
        this.releaseSlot()
      }
    }

    let stdout = ''
    let stderr = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    this.client.exec(cmd, (err, stream) => {
      if (err) {
        Object.assign(err, { cmd, stdout, stderr })
        release()
        reject(err)
        return
      }

      timer = setTimeout(() => {
        try {
          stream.destroy()
        } catch {
          /* ignore */
        }
        release()
        const timeoutError = new Error(`SSH exec timeout (${timeoutMs}ms): ${cmd.slice(0, 60)}`)
        Object.assign(timeoutError, { cmd, stdout, stderr })
        reject(timeoutError)
      }, timeoutMs)

      stream.on('data', (d: Buffer) => {
        stdout += d.toString('utf-8')
      })
      stream.stderr.on('data', (d: Buffer) => {
        stderr += d.toString('utf-8')
      })
      stream.on('close', (code: number | null) => {
        if (timer) clearTimeout(timer)
        release()
        resolve({ stdout, stderr, code: code ?? 0 })
      })
      stream.on('error', (e: Error) => {
        if (timer) clearTimeout(timer)
        release()
        Object.assign(e, { cmd, stdout, stderr })
        reject(e)
      })
    })
  }

  // ─── Public API: openShell ─────────────────────────────────────

  openShell(cols = 80, rows = 24): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      if (!this.client || this.status !== 'connected') {
        reject(new Error('SSH: not connected, cannot open shell'))
        return
      }
      this.client.shell(
        { term: 'xterm-256color', cols, rows },
        (err, stream) => {
          if (err) {
            reject(err)
            return
          }
          resolve(stream)
        },
      )
    })
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private setStatus(s: SSHStatus): void {
    if (this.status === s) return
    this.status = s
    this.emit('status', s)
  }

  /**
   * Recharge la configuration SSH et reconnecte sans redémarrer le serveur.
   * Cf. SDD v3.0 §4.
   */
  async reload(): Promise<void> {
    console.info('[SSH] Rechargement de la configuration...')
    this.destroy()

    const { loadSSHConfig } = await import('./ssh-config-loader')
    this.config             = await loadSSHConfig()
    this.destroyed          = false
    this.retryCount         = 0
    this.connect()
  }
}

// ─── Singleton ────────────────────────────────────────────────────

let _instance: SSHSessionManager | null = null

export function getSSHManager(): SSHSessionManager {
  if (!_instance) {
    throw new Error(
      'SSHSessionManager not initialised. Call initSSHManager() first.',
    )
  }
  return _instance
}

export function initSSHManager(config: ConnectConfig): SSHSessionManager {
  if (_instance) _instance.destroy()
  _instance = new SSHSessionManager(config)
  _instance.start()
  return _instance
}
