import type { Overview } from '~/types/esos'

/**
 * Wrapper léger autour de `useOverviewStore` (Pinia) qui conserve
 * l'API utilisée par les pages : `overview`, `pending`, `error`,
 * `refresh`, `lastRefresh`. Le polling global est piloté par
 * `plugins/stores.client.ts`.
 */
export function useOverview() {
  const store = useOverviewStore()

  const overview = computed<Overview | null>(() => store.data)
  const pending = computed(() => store.loading)
  const error = computed(() => store.error)
  const lastRefresh = computed(() => store.lastRefresh)

  function refresh() {
    return store.fetch()
  }

  return { overview, pending, error, refresh, lastRefresh, store }
}
