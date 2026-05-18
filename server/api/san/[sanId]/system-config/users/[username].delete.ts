import { getSSHPool } from '~~/server/utils/ssh-pool'

const PROTECTED_USERS = ['root']

export default defineEventHandler(async (event) => {
  const sanId    = getRouterParam(event, 'sanId')!
  const username = getRouterParam(event, 'username')!

  if (!username || !/^[a-z][a-z0-9_-]*$/.test(username)) {
    throw createError({ statusCode: 400, message: 'Nom d\'utilisateur invalide' })
  }

  if (PROTECTED_USERS.includes(username)) {
    throw createError({ statusCode: 403, message: `L'utilisateur "${username}" ne peut pas être supprimé` })
  }

  const pool    = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  if (!manager) throw createError({ statusCode: 503, message: 'SSH indisponible' })

  // Verify user exists
  const existResult = await manager.exec(
    `grep -q "^${username}:" /etc/passwd && echo exists || echo notfound`,
    10_000,
  )
  if (existResult.stdout.trim() !== 'exists') {
    throw createError({ statusCode: 404, message: `L'utilisateur "${username}" est introuvable` })
  }

  // ESOS TUI delete sequence (menu_system.c delUserDialog):
  // Step 1: remove from ESOS group (root) — ignore failure if already removed
  await manager.exec(`/usr/sbin/delgroup ${username} root 2>&1 || true`, 10_000)

  // Step 2: delete user (no -r: home is /tmp, must not be deleted)
  const delResult = await manager.exec(
    `/usr/sbin/deluser ${username} 2>&1; echo "EXITCODE:$?"`,
    15_000,
  )
  const delExitMatch = delResult.stdout.match(/EXITCODE:(\d+)/)
  const delCode = delExitMatch ? parseInt(delExitMatch[1]) : 1
  if (delCode !== 0) {
    const errOut = delResult.stdout.replace(/EXITCODE:\d+/, '').trim()
    throw createError({ statusCode: 500, message: `Échec suppression : ${errOut || 'erreur inconnue'}` })
  }

  // Persist
  await manager.exec('conf_sync.sh 2>/dev/null || true', 15_000)

  return { ok: true, username }
})
