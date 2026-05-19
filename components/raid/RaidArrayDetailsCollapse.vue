<template>
  <details class="mt-2 rounded border border-gray-200 dark:border-gray-700 text-sm">
    <summary class="cursor-pointer px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 select-none list-none">
      {{ t('raid.details.toggle') }}
    </summary>
    <div class="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-2">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
</script>
