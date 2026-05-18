import { runCommand }                  from '~~/server/utils/config-writer'
import { readConfigFiles, NOT_FOUND }  from '~~/server/utils/config-reader'
import { getSSHPool }                  from '~~/server/utils/ssh-pool'
import { getSanSummary, updateSan }    from '~~/server/db/repositories/san.repository'
import * as NetworkConfParser          from '~~/server/utils/parsers/network-conf.parser'

const RC_NETWORK   = '/etc/rc.d/rc.network'
const NETWORK_CONF = '/etc/network.conf'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!

  // ── Étape 1 : pendant que SSH est encore UP, lire le fichier réseau déjà
  //    écrit par network.patch et détecter si l'IP SSH va changer.
  //    Stratégie :
  //    - Lire le FQDN de l'ESOS via SSH (disponible avant le restart).
  //    - Si l'IP SSH courante disparaît des IPs statiques (nouvelle IP statique
  //      ou bascule en DHCP), mettre à jour la DB :
  //      • nouvelle IP statique connue → utiliser cette IP
  //      • DHCP ou ambiguïté → utiliser le FQDN (résolution DNS dynamique)
  try {
    const san = getSanSummary(sanId)
    if (san) {
      // Lire le FQDN pendant que SSH est encore connecté
      let fqdn: string | null = null
      try {
        const r = await runCommand(sanId, 'hostname -f 2>/dev/null || hostname 2>/dev/null || true', true, 5_000)
        fqdn = r.stdout.trim() || null
      } catch { /* SSH peut déjà être lent, non-fatal */ }

      const files   = await readConfigFiles(sanId, [NETWORK_CONF])
      const content = files.get(NETWORK_CONF)
      if (content && content !== NOT_FOUND) {
        const netConfig    = NetworkConfParser.parseNetworkConf(content)
        const allStaticIPs = netConfig.interfaces
          .filter(i => !i.useDHCP && i.ipAddress)
          .map(i => i.ipAddress!)

        const hostStillStatic = allStaticIPs.includes(san.host)

        if (!hostStillStatic) {
          // L'ancienne IP SSH disparaît du fichier de config (IP changée ou DHCP)
          const otherStaticIPs = allStaticIPs.filter(ip => ip !== san.host)

          let newHost: string | null = null
          if (otherStaticIPs.length === 1) {
            // Un seul candidat statique → c'est la nouvelle IP
            newHost = otherStaticIPs[0]
          } else if (fqdn && fqdn !== san.host) {
            // Ambiguïté ou bascule DHCP → utiliser le FQDN pour la résolution DNS
            newHost = fqdn
          }

          if (newHost) {
            console.log(`[network restart] Mise à jour hôte SSH DB : ${san.host} → ${newHost}`)
            updateSan(sanId, { host: newHost })
          } else {
            console.warn(`[network restart] Impossible de déterminer le nouvel hôte SSH (fqdn=${fqdn})`)
          }
        }
      }
    }
  } catch (err) {
    console.warn('[network restart] Détection changement IP échouée (non-fatal):', (err as Error).message)
  }

  // ── Étape 2 : appliquer la config réseau sur ESOS.
  // Use "apply" instead of "stop/start":
  // - "apply" hot-reloads the IP config without bringing the interface down first.
  // - "stop" followed by "start" via SSH is broken — after "stop" the network is
  //   down so the "start" command can never be sent over SSH.
  // When the IP changes, SSH will still drop (expected), but the interface stays
  // UP and the new IP is immediately active.
  try {
    await runCommand(sanId, `${RC_NETWORK} apply 2>&1 || true`, true, 15_000)
  } catch (err) {
    // SSH channel will close when the IP address changes — this is expected.
    console.info('[network apply] SSH closed (expected — IP changed):', (err as Error).message)
  }

  // ── Étape 3 : détruire le manager SSH (qui a l'ancienne IP en mémoire)
  //    et en recréer un depuis la DB (qui a maintenant la bonne IP).
  const pool = getSSHPool()
  await pool.remove(sanId)
  pool.getOrCreate(sanId).catch((err) =>
    console.warn('[network apply] Reconnect failed:', (err as Error).message),
  )

  return { ok: true }
})
