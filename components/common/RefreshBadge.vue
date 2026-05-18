<template>
  <span class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
    <span>{{ t('storage.common.refreshBadge.prefix') }}</span>
    <span v-if="timeAgo">{{ timeAgo }}</span>
    <span v-else>—</span>
  </span>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

const props = defineProps<{
  lastRefresh: Date | null
  interval?: number
}>()

const now = useNow({ interval: 1000 })

const timeAgo = computed(() => {
  if (!props.lastRefresh) return null
  const secs = Math.floor(
    (now.value.getTime() - props.lastRefresh.getTime()) / 1000,
  )
  if (secs < 5) return t('storage.common.refreshBadge.justNow') as string
  if (secs < 60) return t('storage.common.refreshBadge.secondsAgo', { secs }) as string
  return t('storage.common.refreshBadge.minutesAgo', { mins: Math.floor(secs / 60) }) as string
})
</script>
