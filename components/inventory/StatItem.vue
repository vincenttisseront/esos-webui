<template>
  <div>
    <dt class="text-[10px] uppercase tracking-wide text-gray-400 truncate">{{ label }}</dt>
    <dd class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ value || '—' }}</dd>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value: string; wide?: boolean }>()
</script>
