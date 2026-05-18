<template>
  <span
    class="inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium"
    :class="cls"
  >
    {{ type }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ type: string }>()

const cls = computed(() => ({
  HDD:     'bg-gray-100 text-gray-600',
  SSD:     'bg-blue-100 text-blue-700',
  NVMe:    'bg-purple-100 text-purple-700',
  Unknown: 'bg-gray-50 text-gray-400',
}[props.type] ?? 'bg-gray-100 text-gray-500'))
</script>
