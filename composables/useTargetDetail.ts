import type { Ref } from 'vue'
import type { Target } from '~/types/esos'

/**
 * Charge le détail d'une target via /api/targets/:name et pousse
 * les erreurs HTTP dans le store global. Conforme SDD v1.5 §13.
 */
export function useTargetDetail(name: Ref<string>) {
  const errorStore = useErrorStore()
  const target = ref<Target | null>(null)
  const loading = ref(false)

  async function fetchOne() {
    if (!name.value) return
    loading.value = true
    try {
      target.value = await $fetch<Target>(
        `/api/targets/${encodeURIComponent(name.value)}`,
      )
    } catch (err: unknown) {
      const e = err as { statusCode?: number; message?: string }
      errorStore.push({
        level: e.statusCode === 503 ? 'warning' : 'error',
        message: `Impossible de charger la target ${name.value}: ${e.message ?? 'erreur inconnue'}`,
        source: 'target',
        code: e.statusCode,
      })
      target.value = null
    } finally {
      loading.value = false
    }
  }

  watch(name, fetchOne, { immediate: true })

  return { target, loading, refresh: fetchOne }
}
