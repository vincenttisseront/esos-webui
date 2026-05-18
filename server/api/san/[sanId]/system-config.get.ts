import { getSSHPool } from '../../../utils/ssh-pool'
import { readSystemConfigSections } from '../../../utils/system-config.service'
import type { SystemConfigResponse } from '../../../utils/types'

const SSH_DOWN_RESPONSE = (sanId: string, sshStatus: string): SystemConfigResponse => ({
  sanId,
  scannedAt: Date.now(),
  sshStatus: sshStatus as SystemConfigResponse['sshStatus'],
  hostname:  { data: null, status: 'unavailable', error: { code: 'SSH_DOWN', message: `SSH non connecté (${sshStatus})` } },
  dateTime:  { data: null, status: 'unavailable', error: { code: 'SSH_DOWN', message: `SSH non connecté (${sshStatus})` } },
  network:   { data: null, status: 'unavailable', error: { code: 'SSH_DOWN', message: `SSH non connecté (${sshStatus})` } },
  smtp:      { data: null, status: 'unavailable', error: { code: 'SSH_DOWN', message: `SSH non connecté (${sshStatus})` } },
})

export default defineEventHandler(async (event): Promise<SystemConfigResponse> => {
  const sanId   = getRouterParam(event, 'sanId')!
  const pool    = getSSHPool()
  const manager = pool.get(sanId)

  if (!manager || !manager.isReady()) {
    return SSH_DOWN_RESPONSE(sanId, manager?.getStatus() ?? 'error')
  }

  try {
    return await readSystemConfigSections(sanId, manager)
  } catch (err: any) {
    console.error(`[system-config.get] ${sanId}:`, err.message)
    const sshStatus = manager.getStatus()
    const errObj = { code: 'SSH_ERROR', message: err.message ?? 'Erreur inattendue' }
    return {
      sanId,
      scannedAt: Date.now(),
      sshStatus,
      hostname:  { data: null, status: 'error', error: errObj },
      dateTime:  { data: null, status: 'error', error: errObj },
      network:   { data: null, status: 'error', error: errObj },
      smtp:      { data: null, status: 'error', error: errObj },
    }
  }
})
