import type { SSHStatus } from '~/stores/ssh'

/**
 * Wrapper léger autour de `useSSHStore` (Pinia). L'API publique
 * (`status`, `connected`, `refresh`) est conservée pour les
 * composants existants.
 */
export function useSSHStatus() {
  const store = useSSHStore()

  const status = computed<SSHStatus>(() => store.status)
  const connected = computed(() => store.isReady)

  function refresh() {
    return store.fetchStatus()
  }

  return { status, connected, refresh, store }
}
