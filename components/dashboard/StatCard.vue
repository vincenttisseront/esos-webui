<template>
  <div
    class="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
  >
    <div
      class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
      :class="bgColor ?? 'bg-gray-100 dark:bg-gray-800'"
    >
      {{ icon }}
    </div>
    <div>
      <div
        v-if="loading"
        class="h-7 w-12 bg-gray-200 dark:bg-gray-700 animate-pulse rounded mb-1"
      />
      <p
        v-else
        class="text-2xl font-bold text-gray-800 dark:text-gray-100"
      >
        {{ value ?? '—' }}
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400 font-medium">
        {{ label }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  label: string
  value?: number
  loading?: boolean
  bgColor?: string
}>()
</script>
