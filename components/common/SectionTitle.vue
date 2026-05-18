<template>
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
        {{ title }}
      </h2>
      <span
        v-if="typeof count === 'number'"
        class="text-xs text-gray-400 dark:text-gray-500"
      >
        ({{ count }})
      </span>
    </div>
    <span
      v-if="live"
      class="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium"
    >
      <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      {{ t('storage.common.sectionTitle.live') }}
    </span>
  </div>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

defineProps<{
  title: string
  count?: number
  live?: boolean
}>()
</script>
