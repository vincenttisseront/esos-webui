import { getSSHPool } from '~~/server/utils/ssh-pool'

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!

  try {
    const pool    = getSSHPool()
    const manager = await pool.getOrCreate(sanId)

    // Essai timedatectl (systemd), sinon zone.tab, sinon find
    const { stdout, stderr } = await manager.exec(
      'timedatectl list-timezones 2>/dev/null || (awk \'NF && !/^#/{print $3}\' /usr/share/zoneinfo/zone1970.tab 2>/dev/null || awk \'NF && !/^#/{print $3}\' /usr/share/zoneinfo/zone.tab 2>/dev/null || find /usr/share/zoneinfo -maxdepth 3 -type f | sed \'s|/usr/share/zoneinfo/||\' | grep -vE \'\\.(tab|list)$|^[+]VERSION$|posixrules|tzdata|^(posix|right)/\' | sort)',
      15_000,
    )

    if (stderr?.trim()) console.warn('[timezones] stderr:', stderr.trim().slice(0, 300))

    const timezones = stdout.split('\n').map(s => s.trim()).filter(Boolean)
    console.log(`[timezones] ${sanId}: ${timezones.length} entrées`)
    return { timezones }
  } catch (err) {
    console.warn('[timezones] SSH indisponible:', (err as Error).message)
    return { timezones: [] }
  }
})
