<template>
  <span
    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
    :class="enabled
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
  >
    <span
      class="w-1.5 h-1.5 rounded-full"
      :class="enabled ? 'bg-green-500' : 'bg-gray-400'"
    />
    {{ enabled ? t('storage.targets.badge.on') : t('storage.targets.badge.off') }}
  </span>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

defineProps<{ enabled: boolean }>()
</script>
