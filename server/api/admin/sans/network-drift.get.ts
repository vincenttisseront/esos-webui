import { getAllSans } from '../../../db/repositories/san.repository'
import { runCommand }  from '../../../utils/config-writer'
import * as NetworkConfParser from '../../../utils/parsers/network-conf.parser'

interface DriftResult {
  sanId:    string
  sanLabel: string
  drifted:  boolean
}

/**
 * For each active SAN, compare the IPs stored in /etc/network.conf
 * with the live IPs from `ip addr`. Returns SANs where a static
 * interface has a different live IP than what's configured.
 */
export default defineEventHandler(async (): Promise<DriftResult[]> => {
  const sans = getAllSans().filter((s) => s.status === 'active')

  const results = await Promise.allSettled(
    sans.map(async (san): Promise<DriftResult> => {
      try {
        const [confOut, ipOut] = await Promise.all([
          runCommand(san.id, 'cat /etc/network.conf 2>/dev/null || echo ""', true, 5_000),
          runCommand(san.id, 'ip -j addr 2>/dev/null || echo "[]"', true, 5_000),
        ])

        const netConfig = NetworkConfParser.parseNetworkConf(confOut.stdout)
        const ipAddrs: Array<{ ifname: string; addr_info: Array<{ family: string; local: string }> }> =
          JSON.parse(ipOut.stdout || '[]')

        const drifted = netConfig.interfaces.some((iface) => {
          if (iface.useDHCP || !iface.ipAddress) return false
          const live = ipAddrs.find((i) => i.ifname === iface.ifname)
          if (!live) return false
          const v4 = live.addr_info.find((a) => a.family === 'inet')
          return v4 && v4.local !== iface.ipAddress
        })

        return { sanId: san.id, sanLabel: san.label, drifted }
      } catch {
        return { sanId: san.id, sanLabel: san.label, drifted: false }
      }
    }),
  )

  return results
    .filter((r): r is PromiseFulfilledResult<DriftResult> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((r) => r.drifted)
})
