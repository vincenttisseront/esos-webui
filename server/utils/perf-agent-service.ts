/**
 * Contrôle du service rc.perfagent et du démarrage automatique (SDD v3.10 §5.3).
 */
import type { SSHSessionManager } from './ssh-session-manager'
import type { PerfAgentServiceStatus } from './perf-agent-types'

const RC_CONF = '/etc/rc.conf'
const RC_SCRIPT = '/etc/rc.d/rc.perfagent'
const PERFAGENT_KEY = 'rc.perfagent_enable'

export async function readPerfAgentService(manager: SSHSessionManager): Promise<PerfAgentServiceStatus> {
  const cmd = [
    // Statut rc.conf
    `grep -i "^${PERFAGENT_KEY}" "${RC_CONF}" 2>/dev/null | tail -1`,
    'echo "---"',
    // Statut service (fallback sur ps si status non supporté)
    `${RC_SCRIPT} status 2>/dev/null || ps aux 2>/dev/null | grep -v grep | grep perfagentmain.py || echo ""`,
    'echo "---"',
    // PID et uptime
    `ps -o pid=,etime= -C python 2>/dev/null | grep -E '[0-9]' || ps aux 2>/dev/null | awk '/perfagentmain.py/{print $2, $10}' | head -1 || echo ""`,
  ].join('\n')

  const { stdout } = await manager.exec(cmd, 10_000)
  const parts = stdout.split('---\n')

  const rcLine = (parts[0] ?? '').trim()
  const statusOut = (parts[1] ?? '').trim()
  const pidLine = (parts[2] ?? '').trim()

  const enabledOnBoot = /YES/i.test(rcLine)
  const running = statusOut.length > 0 && !/(stopped|not running)/i.test(statusOut)

  let pid: number | undefined
  let uptimeSec: number | undefined
  if (pidLine) {
    const m = pidLine.match(/(\d+)\s+(.+)/)
    if (m) {
      pid = parseInt(m[1], 10) || undefined
      uptimeSec = parseEtime(m[2].trim())
    }
  }

  return {
    enabledOnBoot,
    running,
    pid,
    uptimeSec,
    lastCheckedAt: Date.now(),
    rawStatus: statusOut || (running ? 'running' : 'stopped'),
  }
}

export async function controlPerfAgentService(
  manager: SSHSessionManager,
  action: 'start' | 'stop' | 'restart' | 'enable' | 'disable',
): Promise<PerfAgentServiceStatus> {
  let cmd: string

  switch (action) {
    case 'start':
    case 'stop':
    case 'restart':
      cmd = `${RC_SCRIPT} ${action} 2>&1 || true`
      break
    case 'enable':
      cmd = [
        // Supprimer toute ligne existante (commentée ou non)
        `sed -i '/^#\\?${PERFAGENT_KEY}/d' "${RC_CONF}" 2>/dev/null || true`,
        `echo "${PERFAGENT_KEY}=YES" >> "${RC_CONF}"`,
        'conf_sync.sh 2>/dev/null || true',
      ].join(' && ')
      break
    case 'disable':
      cmd = [
        `sed -i '/^#\\?${PERFAGENT_KEY}/d' "${RC_CONF}" 2>/dev/null || true`,
        `echo "${PERFAGENT_KEY}=NO" >> "${RC_CONF}"`,
        'conf_sync.sh 2>/dev/null || true',
      ].join(' && ')
      break
  }

  await manager.exec(cmd, 15_000)
  return readPerfAgentService(manager)
}

/** Lit la présence de croncompact.py dans /etc/crontab. */
export async function readCompactionStatus(manager: SSHSessionManager): Promise<{
  active: boolean
  cronLine?: string
}> {
  const { stdout } = await manager.exec(
    `grep -i "croncompact" /etc/crontab 2>/dev/null | grep -v "^#" | head -1 || echo ""`,
    5_000,
  )
  const cronLine = stdout.trim()
  return { active: cronLine.length > 0, cronLine: cronLine || undefined }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convertit le format etime de ps (DD-HH:MM:SS ou HH:MM:SS ou MM:SS) en secondes. */
function parseEtime(etime: string): number | undefined {
  // Format: [[DD-]HH:]MM:SS
  const parts = etime.split(':').reverse()
  let secs = 0
  if (parts[0]) secs += parseInt(parts[0], 10)
  if (parts[1]) secs += parseInt(parts[1], 10) * 60
  if (parts[2]) {
    const hourPart = parts[2].split('-')
    secs += parseInt(hourPart[hourPart.length - 1], 10) * 3600
    if (hourPart.length > 1) secs += parseInt(hourPart[0], 10) * 86400
  }
  return isNaN(secs) ? undefined : secs
}
