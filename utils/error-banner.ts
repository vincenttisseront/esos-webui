import type { SSHStatus } from '~/stores/ssh'

/** Whether the global SSH status banner should be visible. */
export function shouldShowGlobalSshBanner(
  sshStatus: SSHStatus,
  hasSshSourceError: boolean,
): boolean {
  if (sshStatus === 'unconfigured') return true
  if (sshStatus === 'connected') return hasSshSourceError
  return true // connecting, reconnecting, error
}

/** CSS tone for the global SSH banner (not refresh/API failures). */
export function globalSshBannerTone(
  sshStatus: SSHStatus,
): 'unconfigured' | 'error' | 'reconnecting' | 'connecting' | null {
  if (sshStatus === 'unconfigured') return 'unconfigured'
  if (sshStatus === 'error') return 'error'
  if (sshStatus === 'reconnecting') return 'reconnecting'
  if (sshStatus === 'connecting') return 'connecting'
  return null
}
