/**
 * Global state tracking which SANs have a saved-but-not-yet-applied network config.
 * Persists across navigation (useState) but resets on page reload (intentional).
 */
export function useNetworkPendingRestart() {
  const pending = useState<Record<string, string>>('network:pending-restart', () => ({}))

  function markPending(sanId: string, sanLabel: string) {
    pending.value = { ...pending.value, [sanId]: sanLabel }
  }

  function clearPending(sanId: string) {
    const next = { ...pending.value }
    delete next[sanId]
    pending.value = next
  }

  function isPending(sanId: string) {
    return computed(() => sanId in pending.value)
  }

  const pendingEntries = computed(() =>
    Object.entries(pending.value).map(([id, label]) => ({ id, label })),
  )

  const hasPending = computed(() => pendingEntries.value.length > 0)

  return { markPending, clearPending, isPending, pendingEntries, hasPending }
}
