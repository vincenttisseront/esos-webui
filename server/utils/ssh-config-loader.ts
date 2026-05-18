/**
 * Charge la configuration SSH depuis la BDD (avec fallback env).
 * Cf. SDD v3.0 §4.
 */
import { getSetting } from '../db/repositories/settings.repository'
import type { ConnectConfig } from 'ssh2'

export async function loadSSHConfig(): Promise<ConnectConfig> {
  const host     = (await getSetting('ssh.host'))        || process.env.NUXT_SSH_HOST        || ''
  const port     = (await getSetting('ssh.port'))        || process.env.NUXT_SSH_PORT        || '22'
  const username = (await getSetting('ssh.username'))    || process.env.NUXT_SSH_USER        || 'root'
  const authType = (await getSetting('ssh.auth_type'))                                       || 'key'
  const privKey  = (await getSetting('ssh.private_key')) || process.env.NUXT_SSH_PRIVATE_KEY || ''
  const password = (await getSetting('ssh.password'))    || process.env.NUXT_SSH_PASSWORD    || ''

  if (!host) throw new Error('ssh.host non configuré')

  return {
    host,
    port:       parseInt(port, 10),
    username,
    privateKey: authType === 'key' && privKey ? Buffer.from(privKey, 'base64') : undefined,
    password:   authType === 'password' ? password : undefined,
  }
}
