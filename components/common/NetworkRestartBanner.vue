<template>
  <div
    v-if="isOperatorOrAdmin && hasPending"
    class="flex items-center gap-3 px-6 py-2.5 bg-orange-500 text-white text-sm font-medium"
  >
    <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0" />
    <span class="flex-1">
      {{ t('banner.network.body_prefix') }}<span class="font-semibold">{{ pendingLabels }}</span>{{ t('banner.network.body_suffix') }}
    </span>

    <button
      v-for="entry in pendingEntries"
      :key="entry.id"
      class="shrink-0 flex items-center gap-1 bg-white dark:bg-gray-900/20 hover:bg-white dark:bg-gray-900/30 rounded px-2 py-1 text-xs font-semibold transition"
      :disabled="verifying[entry.id]"
      @click="verify(entry.id)"
    >
      <UIcon
        :name="verifying[entry.id] ? 'i-heroicons-arrow-path' : 'i-heroicons-check-circle'"
        class="w-3.5 h-3.5"
        :class="verifying[entry.id] && 'animate-spin'"
      />
      {{ verifying[entry.id] ? t('banner.network.test_in_progress') : t('banner.network.test_connection') }}
    </button>

    <button
      class="shrink-0 flex items-center gap-1 bg-white dark:bg-gray-900/10 hover:bg-white dark:bg-gray-900/20 rounded px-2 py-1 text-xs transition"
      @click="dismissAll"
    >
      <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
      {{ t('common.dismiss') }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SSHLiveStatus } from '~/server/utils/selection-context'

const auth = useAuthStore()
const { t, tError } = useEsosI18n()
const isOperatorOrAdmin = computed(
  () => auth.user?.role === 'operator' || auth.user?.role === 'admin',
)

const { hasPending, pendingEntries, clearPending } = useNetworkPendingRestart()
const toast = useAppToast()

const verifying = ref<Record<string, boolean>>({})

// Auto-vérification : polling dédié toutes les 5s pendant qu'il y a des SANs en attente
const prevStatuses = ref<Record<string, SSHLiveStatus>>({})
let pollTimer: ReturnType<typeof setInterval> | null = null

async function pollStatuses() {
  if (!isOperatorOrAdmin.value || !hasPending.value) return
  try {
    const statuses = await $fetch<Record<string, SSHLiveStatus>>('/api/admin/sans/statuses')
    for (const { id } of pendingEntries.value) {
      const was = prevStatuses.value[id]
      const now = statuses[id]
      if (now === 'connected' && was !== 'connected' && !verifying.value[id]) {
        // Attendre 3s que SSH soit stable avant de lancer le test
        setTimeout(() => verify(id), 3_000)
      }
    }
    prevStatuses.value = statuses
  } catch {
    // Silencieux — ne pas bloquer l'UI si le polling échoue
  }
}

onMounted(() => {
  if (!isOperatorOrAdmin.value) return
  pollStatuses()
  pollTimer = setInterval(pollStatuses, 5_000)
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const pendingLabels = computed(() =>
  pendingEntries.value.map((e) => e.label).join(', '),
)

async function verify(sanId: string) {
  if (!isOperatorOrAdmin.value) return
  verifying.value = { ...verifying.value, [sanId]: true }
  try {
    const result = await $fetch<{ success: boolean; latencyMs?: number; error?: string }>(
      `/api/admin/sans/${sanId}/test`,
    )
    if (result.success) {
      clearPending(sanId)
      toast.success(
        t('banner.network.toast_verify_ok_title'),
        t('banner.network.toast_verify_ok_desc'),
      )
    } else {
      toast.error(
        t('banner.network.toast_verify_fail_title'),
        result.error ?? t('banner.network.toast_verify_fail_desc_default'),
      )
    }
  } catch (err: unknown) {
    toast.error(
      t('banner.network.toast_ssh_test_fail_title'),
      tError(err as never, String(err)),
    )
  } finally {
    const next = { ...verifying.value }
    delete next[sanId]
    verifying.value = next
  }
}

function dismissAll() {
  for (const entry of pendingEntries.value) {
    clearPending(entry.id)
  }
}
</script>
