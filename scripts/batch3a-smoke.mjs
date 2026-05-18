/**
 * Batch 3A — smoke `.output` server: public health + terminal WS unauthenticated close.
 * Run after `npm run build`. Uses NITRO_PORT on 127.0.0.1 only.
 */
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const port = String(30990 + Math.floor(Math.random() * 80))

const child = spawn('node', ['.output/server/index.mjs'], {
  cwd: root,
  env: {
    ...process.env,
    NITRO_PORT: port,
    NITRO_HOST: '127.0.0.1',
    NODE_ENV: 'production',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let bootErr = ''
child.stderr.on('data', (c) => { bootErr += String(c) })
child.stdout.on('data', (c) => { bootErr += String(c) })

function shutdown() {
  try {
    child.kill('SIGTERM')
  } catch { /* ignore */ }
}

process.on('exit', shutdown)

await delay(3000)

try {
  const health = await fetch(`http://127.0.0.1:${port}/api/health`)
  if (!health.ok) throw new Error(`/api/health HTTP ${health.status}`)
  const j = await health.json()
  if (j.status !== 'ok' || typeof j.timestamp !== 'string') {
    throw new Error(`unexpected health payload: ${JSON.stringify(j)}`)
  }

  const closeCode = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/terminal?sanId=test`)
    const t = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      reject(new Error('WebSocket close timeout'))
    }, 8000)
    ws.addEventListener('close', (ev) => {
      clearTimeout(t)
      resolve(ev.code)
    })
    ws.addEventListener('error', (e) => {
      clearTimeout(t)
      reject(e.error ?? e)
    })
  })

  if (closeCode !== 1008) {
    throw new Error(`expected terminal WS close 1008 (policy), got ${closeCode}`)
  }

  console.log('[batch3a-smoke] ok — /api/health minimal JSON; /ws/terminal unauthenticated → 1008')
} catch (e) {
  console.error(bootErr.slice(-4000))
  throw e
} finally {
  shutdown()
  await delay(400)
}
