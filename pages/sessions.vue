<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span
        class="inline-flex items-center gap-1.5 text-sm font-medium"
        :class="sessions.length > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'"
      >
        <span
          class="w-2 h-2 rounded-full"
          :class="sessions.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'"
        />
        {{
          sessions.length > 0
            ? t('storage.sessions.list.statusActive', { count: sessions.length })
            : t('storage.sessions.list.statusNone')
        }}
      </span>
      <RefreshBadge :last-refresh="lastRefresh" />
    </div>

    <SessionTable :sessions="sessions" :loading="pending" />
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const { overview, lastRefresh, pending, store } = useOverview()
const sessions = computed(() => overview.value?.sessions ?? [])

onMounted(() => store.setPollingInterval(10_000))
onUnmounted(() => store.setPollingInterval(30_000))
</script>
