import { z } from 'zod'
import { getSSHPool } from '~~/server/utils/ssh-pool'

const bodySchema = z.object({
  username: z.string()
    .min(1)
    .max(20)
    .regex(/^[a-z][a-z0-9_-]*$/, 'Nom invalide (lettres minuscules, chiffres, _ et - uniquement, commence par une lettre)'),
  password: z.string().min(1, 'Mot de passe requis'),
})

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!
  const body  = await readBody(event)

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0].message })
  }

  const { username, password } = parsed.data

  const pool    = getSSHPool()
  const manager = await pool.getOrCreate(sanId)
  if (!manager) throw createError({ statusCode: 503, message: 'SSH indisponible' })

  // Check if user is already an ESOS user (member of root group — same check as GET endpoint)
  const groupCheckResult = await manager.exec(
    `getent group root | awk -F: '{print $4}' | tr ',' '\n' | grep -qx '${username}' && echo member || echo notmember`,
    10_000,
  )
  if (groupCheckResult.stdout.trim() === 'member') {
    throw createError({ statusCode: 409, message: `L'utilisateur "${username}" existe déjà` })
  }

  // Check if user exists in /etc/passwd but is NOT in the root group (orphaned user from a previous failed creation)
  const passwdCheckResult = await manager.exec(
    `grep -q "^${username}:" /etc/passwd && echo exists || echo notfound`,
    10_000,
  )
  const isOrphaned = passwdCheckResult.stdout.trim() === 'exists'

  if (isOrphaned) {
    // User exists in /etc/passwd but not in root group — recover by adding to group
    const addGrpResult = await manager.exec(
      `/usr/sbin/addgroup ${username} root 2>&1; echo "EXITCODE:$?"`,
      10_000,
    )
    const addGrpMatch = addGrpResult.stdout.match(/EXITCODE:(\d+)/)
    if (!addGrpMatch || parseInt(addGrpMatch[1]) !== 0) {
      const errOut = addGrpResult.stdout.replace(/EXITCODE:\d+/, '').trim()
      throw createError({ statusCode: 500, message: `Échec récupération utilisateur orphelin : ${errOut || 'erreur inconnue'}` })
    }
  }
  else {
    // Create user with BusyBox adduser — exact ESOS TUI command (menu_system.c):
    // /usr/sbin/adduser -h /tmp -g 'ESOS User' -s /bin/bash -G root -D <username>
    const addResult = await manager.exec(
      `/usr/sbin/adduser -h /tmp -g 'ESOS User' -s /bin/bash -G root -D ${username} 2>&1; echo "EXITCODE:$?"`,
      15_000,
    )
    const addExitMatch = addResult.stdout.match(/EXITCODE:(\d+)/)
    const addCode = addExitMatch ? parseInt(addExitMatch[1]) : 1
    if (addCode !== 0) {
      const errOut = addResult.stdout.replace(/EXITCODE:\d+/, '').trim()
      throw createError({ statusCode: 500, message: `Échec création utilisateur : ${errOut || 'erreur inconnue'}` })
    }
  }

  // Set password via chpasswd (same tool as ESOS TUI)
  const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "'\\''")
  // ESOS TUI uses: echo 'user:pass' | /usr/sbin/chpasswd -m  (-m = use MD5/SHA hashing)
  const passResult = await manager.exec(
    `printf '%s\\n' '${username}:${escapedPassword}' | /usr/sbin/chpasswd -m 2>&1; echo "EXITCODE:$?"`,
    10_000,
  )
  const passExitMatch = passResult.stdout.match(/EXITCODE:(\d+)/)
  const passCode = passExitMatch ? parseInt(passExitMatch[1]) : 1
  if (passCode !== 0) {
    const errOut = passResult.stdout.replace(/EXITCODE:\d+/, '').trim()
    throw createError({ statusCode: 500, message: `Utilisateur créé mais erreur mot de passe : ${errOut || 'erreur inconnue'}` })
  }

  // Persist
  await manager.exec('conf_sync.sh 2>/dev/null || true', 15_000)

  return { ok: true, username }
})
