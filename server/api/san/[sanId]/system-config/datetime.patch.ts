import { z } from 'zod'
import { readConfigFiles, NOT_FOUND } from '~~/server/utils/config-reader'
import { writeConfigFile, runCommand } from '~~/server/utils/config-writer'
import * as NtpParser                  from '~~/server/utils/parsers/ntp.parser'
import { validateNtpServerHost }       from '~~/server/utils/remote-config-paths'

const NTP_CONF    = '/etc/ntp.conf'
const NTP_SERVER  = '/etc/ntp_server'  // TUI simple file: contains first server only

const bodySchema = z.object({
  timezone:   z.string().min(1).regex(/^[A-Za-z0-9/_+\-]+$/, 'Fuseau horaire invalide'),
  ntpServers: z.array(z.string()).optional().superrefine((servers, ctx) => {
    if (!servers) return
    for (let i = 0; i < servers.length; i++) {
      const err = validateNtpServerHost(servers[i]!)
      if (err) ctx.addIssue({ code: 'custom', message: err, path: ['ntpServers', i] })
    }
  }),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const { timezone, ntpServers } = parsed.data

  // Validate timezone — ESOS TUI uses /usr/share/zoneinfo/posix as its base path
  // (ZONEINFO constant in tui/system.h). We must use that same path so the TUI
  // recognises the symlink target and shows the correct selected timezone.
  const ZONEINFO_BASE = '/usr/share/zoneinfo/posix'
  const tzPath = `${ZONEINFO_BASE}/${timezone}`
  const { stdout: tzCheck } = await runCommand(
    sanId,
    `test -f "${tzPath}" && echo ok || echo notfound`,
  )
  if (tzCheck.trim() !== 'ok') {
    throw createError({ statusCode: 400, message: `Fuseau horaire inconnu : ${timezone}` })
  }

  // Apply timezone — use a symlink pointing to the posix sub-tree, exactly as the TUI does:
  //   symlink("/usr/share/zoneinfo/posix/Europe/Paris", "/etc/localtime")
  // readlink() then returns "/usr/share/zoneinfo/posix/...", which the TUI strips
  // to obtain the bare timezone name for display.
  await runCommand(sanId, `ln -sf "${tzPath}" /etc/localtime && echo "${timezone}" > /etc/timezone`)

  // Apply NTP servers if provided
  if (ntpServers !== undefined) {
    const files      = await readConfigFiles(sanId, [NTP_CONF])
    const ntpContent = files.get(NTP_CONF)
    const original   = ntpContent && ntpContent !== NOT_FOUND ? ntpContent : ''
    const updated    = NtpParser.serializeNtpConf(ntpServers, original)
    await writeConfigFile(sanId, NTP_CONF, updated)

    // Also write /etc/ntp_server (TUI compatibility: one server per line, plain text)
    const firstServer = ntpServers.filter(Boolean)[0] ?? ''
    await writeConfigFile(sanId, NTP_SERVER, firstServer ? `${firstServer}\n` : '')

    // (Re)start or stop ntpd depending on whether servers are configured
    const activeServers = ntpServers.filter(Boolean)
    if (activeServers.length > 0) {
      // rc.ntpd restart (Slackware-style); fall back to manual kill+start
      await runCommand(
        sanId,
        'if [ -x /etc/rc.d/rc.ntpd ]; then /etc/rc.d/rc.ntpd restart 2>/dev/null; else pkill ntpd 2>/dev/null; ntpd -g -p /var/run/ntpd.pid 2>/dev/null; fi || true',
      )
    } else {
      await runCommand(sanId, 'if [ -x /etc/rc.d/rc.ntpd ]; then /etc/rc.d/rc.ntpd stop 2>/dev/null; else pkill ntpd 2>/dev/null; fi || true')
    }
  }

  // Run conf_sync
  await runCommand(sanId, 'conf_sync.sh 2>/dev/null || true')

  return { ok: true }
})
