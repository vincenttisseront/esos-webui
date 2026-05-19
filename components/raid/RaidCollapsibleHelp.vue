<template>
  <details class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40">
    <summary class="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 select-none list-none flex items-center justify-between gap-2">
      <span>{{ title }}</span>
      <span class="text-xs font-normal text-gray-500">{{ t('raid.software.help.toggle_show') }}</span>
    </summary>
    <motion.div
      class="px-4 pb-3 pt-1 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
    >
      <slot />
    </motion.div>
  </details>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()

const { t } = useEsosI18n()
</script>
