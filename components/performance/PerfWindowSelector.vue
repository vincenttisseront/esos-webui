<template>
  <div class="flex gap-1.5">
    <UButton
      v-for="w in windows"
      :key="w.value"
      size="xs"
      :color="modelValue === w.value ? 'primary' : 'gray'"
      :variant="modelValue === w.value ? 'solid' : 'ghost'"
      :label="w.label"
      @click="$emit('update:modelValue', w.value)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>()
defineEmits<{ 'update:modelValue': [value: string] }>()

const windows = [
  { value: '15m', label: '15m' },
  { value: '1h',  label: '1h' },
  { value: '6h',  label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7j' },
  { value: '31d', label: '31j' },
]
</script>
