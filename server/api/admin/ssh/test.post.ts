import { Client } from 'ssh2'

interface TestSSHBody {
  host:        string
  port?:       number
  username?:   string
  authType:    'key' | 'password'
  privateKey?: string
  password?:   string
}

export default defineEventHandler(async (event) => {
  const body    = await readBody<TestSSHBody>(event)
  const timeout = 8_000

  return new Promise<{ success: boolean; latencyMs?: number; error?: string }>((resolve) => {
    const client = new Client()
    const start  = Date.now()

    const timer = setTimeout(() => {
      client.end()
      resolve({ success: false, error: `Timeout (${timeout}ms)` })
    }, timeout)

    client.on('ready', () => {
      clearTimeout(timer)
      client.exec('echo "esos-ok"', (err, stream) => {
        if (err) {
          client.end()
          resolve({ success: false, error: err.message })
          return
        }
        let stdout = ''
        stream.on('data', (d: Buffer) => { stdout += d.toString() })
        stream.on('close', () => {
          client.end()
          resolve({
            success:   stdout.trim() === 'esos-ok',
            latencyMs: Date.now() - start,
            error:     stdout.trim() !== 'esos-ok' ? 'Réponse inattendue' : undefined,
          })
        })
      })
    })

    client.on('error', (err) => {
      clearTimeout(timer)
      resolve({ success: false, error: err.message })
    })

    client.connect({
      host:         body.host,
      port:         body.port ?? 22,
      username:     body.username ?? 'root',
      privateKey:   body.authType === 'key' && body.privateKey
        ? Buffer.from(body.privateKey, 'base64')
        : undefined,
      password:     body.authType === 'password' ? body.password : undefined,
      readyTimeout: timeout,
    })
  })
})
