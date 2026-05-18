import { setSettings } from '../../db/repositories/settings.repository'
import { getSSHManager } from '../../utils/ssh-session-manager'

interface SSHSettingsBody {
  host:        string
  port?:       number
  username?:   string
  authType:    'key' | 'password'
  privateKey?: string  // Base64, optionnel si non modifié
  password?:   string  // Optionnel si non modifié
}

export default defineEventHandler(async (event) => {
  const body = await readBody<SSHSettingsBody>(event)

  if (!body.host) {
    throw createError({ statusCode: 400, message: 'host obligatoire' })
  }
  if (body.authType === 'key' && !body.privateKey) {
    throw createError({ statusCode: 400, message: 'privateKey requis pour authType=key' })
  }
  if (body.authType === 'password' && !body.password) {
    throw createError({ statusCode: 400, message: 'password requis pour authType=password' })
  }

  const entries: Array<{ key: string; value: string }> = [
    { key: 'ssh.host',      value: body.host                   },
    { key: 'ssh.port',      value: String(body.port ?? 22)     },
    { key: 'ssh.username',  value: body.username ?? 'root'     },
    { key: 'ssh.auth_type', value: body.authType               },
  ]

  if (body.privateKey) entries.push({ key: 'ssh.private_key', value: body.privateKey })
  if (body.password)   entries.push({ key: 'ssh.password',    value: body.password   })

  await setSettings(entries)

  // Recharger la session SSH immédiatement
  try {
    await getSSHManager().reload()
  } catch (err) {
    // Ne pas faire échouer l'API — le statut SSH indiquera l'erreur
    console.warn('[Admin/SSH] Rechargement SSH échoué:', (err as Error).message)
  }

  return { ok: true }
})
