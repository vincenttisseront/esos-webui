/**
 * Periodically checks whether any SAN has a live IP that differs from
 * what's stored in rc.inet1.conf. If so, marks them as pending restart.
 *
 * Operator/admin only — viewers must not call GET /api/admin/sans/network-drift (Batch 2A.2).
 */
export function useNetworkDriftDetection() {
  const auth = useAuthStore()
  const { markPending, isPending } = useNetworkPendingRestart()
  let timer: ReturnType<typeof setInterval> | null = null

  function canAccessAdminDriftRead(): boolean {
    const role = auth.user?.role
    return role === 'operator' || role === 'admin'
  }

  async function check() {
    if (!canAccessAdminDriftRead()) return
    try {
      const drifted = await $fetch<Array<{ sanId: string; sanLabel: string }>>(
        '/api/admin/sans/network-drift',
      )
      for (const entry of drifted) {
        if (!isPending(entry.sanId).value) {
          markPending(entry.sanId, entry.sanLabel)
        }
      }
    } catch {
      // Silently ignore — SSH may be unavailable
    }
  }

  function start(intervalMs = 60_000) {
    if (!canAccessAdminDriftRead()) return
    check() // immediate first check
    timer = setInterval(check, intervalMs)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  return { check, start, stop }
}
