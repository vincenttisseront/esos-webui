import type { Ref } from 'vue'
import type { Target } from '~/types/esos'

export function useTarget(name: Ref<string>) {
  const { data: target, pending, error, refresh } = useFetch<Target>(
    () => `/api/targets/${encodeURIComponent(name.value)}`,
    {
      default: () => null as unknown as Target,
      watch: [name],
    },
  )
  return { target, pending, error, refresh }
}
