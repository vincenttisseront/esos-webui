<template>
  <div
    class="rounded-xl border bg-white dark:bg-gray-900 overflow-hidden"
    :class="danger ? 'border-red-200 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'"
  >
    <!-- En-tête section -->
    <div
      class="flex items-center gap-2 px-5 py-3 border-b"
      :class="danger ? 'border-red-100 bg-red-50 dark:bg-red-950/40' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950'"
    >
      <UIcon :name="icon" class="w-4 h-4" :class="danger ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'" />
      <h2 class="text-sm font-semibold" :class="danger ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'">
        {{ title }}
      </h2>
    </div>
    <!-- Contenu -->
    <div class="px-5 py-4">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; icon: string; danger?: boolean }>()
</script>
