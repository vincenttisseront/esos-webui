import { z } from 'zod'
import { readConfigFiles, NOT_FOUND } from '~~/server/utils/config-reader'
import { writeConfigFile, runCommand } from '~~/server/utils/config-writer'
import * as NetworkConfParser           from '~~/server/utils/parsers/network-conf.parser'

const NETWORK_CONF = '/etc/network.conf'

const bodySchema = z.object({
  hostname: z.string().regex(/^[a-zA-Z0-9-]+$/, 'Hostname invalide (lettres, chiffres, tirets uniquement)'),
  domain:   z.string().regex(/^[a-zA-Z0-9.-]*$/, 'Domaine invalide'),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const { hostname, domain } = parsed.data
  const fqdn = domain ? `${hostname}.${domain}` : hostname

  // Read current network.conf and update [general] hostname/domainname
  const files  = await readConfigFiles(sanId, [NETWORK_CONF])
  const raw    = files.get(NETWORK_CONF)
  const content = raw && raw !== NOT_FOUND ? raw : ''
  const config  = content ? NetworkConfParser.parseNetworkConf(content) : {
    gateway: '', nameservers: [], searchDomain: '', interfaces: [],
  }

  const updated = NetworkConfParser.serializeNetworkConf(config, content, hostname, domain)
  await writeConfigFile(sanId, NETWORK_CONF, updated)

  // Apply hostname immediately via rc.network (also updates /etc/hosts)
  const RC_NETWORK = '/etc/rc.d/rc.network'
  try {
    await runCommand(sanId, `${RC_NETWORK} apply 2>&1 || true`, true, 15_000)
  } catch {
    // rc.network apply may briefly drop the connection — ignore
  }

  return { hostname, domain, fqdn }
})
