import { getSSHManager } from '../../utils/ssh-session-manager'
import { getSetting } from '../../db/repositories/settings.repository'
import { getDB } from '../../db'
import { metricSamples } from '../../db/schema'
import { count, min } from 'drizzle-orm'

export default defineEventHandler(async () => {
  let manager: ReturnType<typeof getSSHManager> | null = null
  try { manager = getSSHManager() } catch { /* not yet initialised */ }
  const db = getDB()

  const [sampleStats] = await db
    .select({ total: count(), oldest: min(metricSamples.timestamp) })
    .from(metricSamples)

  const sshHost = (await getSetting('ssh.host'))     || process.env.NUXT_SSH_HOST || 'non configuré'
  const sshUser = (await getSetting('ssh.username')) || process.env.NUXT_SSH_USER || 'root'
  const sshPort = (await getSetting('ssh.port'))     || '22'

  return {
    app: {
      version:     process.env.npm_package_version ?? '1.0.2',
      nodeUptime:  Math.floor(process.uptime()),
      environment: process.env.NODE_ENV ?? 'production',
    },
    ssh: {
      status: manager?.getStatus() ?? 'unconfigured',
      host:   sshHost,
      port:   parseInt(sshPort, 10),
      user:   sshUser,
    },
    metrics: {
      totalSamples:   sampleStats?.total  ?? 0,
      oldestSampleAt: sampleStats?.oldest ?? null,
    },
  }
})
