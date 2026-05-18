import { getSSHPool } from '../../../../utils/ssh-pool'
import * as NetworkConfParser from '../../../../utils/parsers/network-conf.parser'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id requis' })
  }

  try {
    const pool = getSSHPool()

    // Réutiliser la connexion existante uniquement si elle est active.
    // Si reconnecting/connecting/error, détruire pour forcer une recréation depuis la
    // DB (qui peut avoir une nouvelle IP après "Changer l'adresse IP").
    const existing = pool.get(id)
    if (existing && existing.getStatus() !== 'connected') {
      await pool.remove(id)
    }

    const manager = await pool.getOrCreate(id)

    // Vérifier SSH de base
    const ping = await manager.exec('echo "ok"', 5_000)
    if (ping.code !== 0 || ping.stdout.trim() !== 'ok') {
      return { success: false, error: 'Le SAN ne répond pas via SSH.' }
    }

    // Lire rc.inet1.conf et les IPs live pour vérifier que la config est appliquée
    const [confResult, ipResult] = await Promise.all([
      manager.exec('cat /etc/network.conf 2>/dev/null || echo ""', 5_000),
      manager.exec('ip -j addr 2>/dev/null || echo "[]"', 5_000),
    ])

    const netConfig = NetworkConfParser.parseNetworkConf(confResult.stdout)
    const ipAddrs: Array<{ ifname: string; addr_info: Array<{ family: string; local: string }> }> =
      JSON.parse(ipResult.stdout.trim() || '[]')

    // Chercher les interfaces statiques avec un écart entre config et live
    const drifted = netConfig.interfaces.filter((iface) => {
      if (iface.useDHCP || !iface.ipAddress) return false
      const live = ipAddrs.find((i) => i.ifname === iface.ifname)
      if (!live) return true // interface non trouvée = config non appliquée
      const v4 = live.addr_info.find((a) => a.family === 'inet')
      return !v4 || v4.local !== iface.ipAddress
    })

    if (drifted.length > 0) {
      const details = drifted
        .map((iface) => {
          const live = ipAddrs.find((i) => i.ifname === iface.ifname)
          const v4 = live?.addr_info.find((a) => a.family === 'inet')
          return `${iface.ifname}: configuré ${iface.ipAddress}, actif ${v4?.local ?? '?'}`
        })
        .join('; ')
      return {
        success: false,
        error: `Configuration réseau non encore appliquée — ${details}. Cliquez sur « Redémarrer réseau » pour appliquer.`,
      }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    }
  }
})
