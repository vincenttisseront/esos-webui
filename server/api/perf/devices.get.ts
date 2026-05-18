import { getActiveSSHManager } from '../../utils/ssh-runtime'
import { readPerfAgentConfig } from '../../utils/perf-agent-config'
import type { BlockDeviceInfo } from '../../utils/perf-agent-types'
import { runReadWithSanScope } from '../../utils/san-request-context'

export default defineEventHandler(async (event) => {
  const run = async () => {
    const manager = getActiveSSHManager()
    if (!manager?.isReady()) {
      throw createError({ statusCode: 503, statusMessage: 'SSH non connecté' })
    }

    const [lsblkResult, config] = await Promise.all([
      manager.exec(
        'lsblk -J -b -o NAME,SIZE,TYPE,MODEL,SERIAL,VENDOR,ROTA,TRAN,MOUNTPOINT,STATE 2>/dev/null || echo \'{"blockdevices":[]}\'',
        10_000,
      ),
      readPerfAgentConfig(manager),
    ])

    let blockdevices: any[] = []
    try {
      blockdevices = JSON.parse(lsblkResult.stdout)?.blockdevices ?? []
    } catch { /* lsblk unavailable */ }

    const selected = new Set(config.blockDevices)
    const devices: BlockDeviceInfo[] = blockdevices
      .filter((d: any) => d.type === 'disk')
      .map((d: any) => {
        const name = String(d.name ?? '')
        const tran = String(d.tran ?? '').toLowerCase()
        const isUsb = tran === 'usb'
        const isMounted = !!d.mountpoint

        let warning: string | undefined
        if (isUsb) warning = 'Périphérique USB — probablement le support de démarrage ESOS'
        else if (isMounted) warning = `Monté sur ${d.mountpoint}`

        return {
          name,
          size: Number(d.size ?? 0),
          type: detectDeviceType(tran, d.rota),
          model: d.model?.trim() || undefined,
          serial: d.serial?.trim() || undefined,
          vendor: d.vendor?.trim() || undefined,
          rota: d.rota === true || d.rota === '1',
          tran: tran || undefined,
          mountpoint: d.mountpoint || undefined,
          state: d.state || undefined,
          isSelected: selected.has(name),
          warning,
        } satisfies BlockDeviceInfo
      })

    return devices
  }

  try {
    return await runReadWithSanScope(event, run)
  } catch (err: any) {
    throw createError({
      statusCode: err.statusCode ?? 500,
      message: err.message ?? 'Erreur lecture block devices',
    })
  }
})

function detectDeviceType(tran: string, rota: any): string {
  if (tran === 'nvme') return 'NVMe'
  if (tran === 'usb') return 'USB'
  if (rota === false || rota === '0') return 'SSD'
  return 'HDD'
}
