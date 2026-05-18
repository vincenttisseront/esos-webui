<template>
  <div class="flex gap-1 bg-gray-100 rounded-lg p-1">
    <button
      v-for="w in windows"
      :key="w.value"
      class="px-3 py-1 text-xs rounded-md transition-colors"
      :class="
        modelValue === w.value
          ? 'bg-white text-gray-800 shadow-sm font-medium'
          : 'text-gray-500 hover:text-gray-700'
      "
      @click="$emit('update:modelValue', w.value)"
    >
      {{ w.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
defineEmits(['update:modelValue'])

const windows = [
  { value: '1h',  label: '1h'  },
  { value: '6h',  label: '6h'  },
  { value: '24h', label: '24h' },
]
</script>
