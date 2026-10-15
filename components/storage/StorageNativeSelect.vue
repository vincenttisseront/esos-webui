<template>
  <select
    :id="inputId"
    :value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel || placeholder || 'Select'"
    :class="STORAGE_NATIVE_SELECT_CLASS"
    @change="onChange"
  >
    <option v-if="placeholder" disabled value="">{{ placeholder }}</option>
    <option
      v-for="opt in normalizedOptions"
      :key="opt.value"
      :value="opt.value"
      :disabled="opt.disabled"
    >
      {{ opt.label }}
    </option>
  </select>
</template>

<script setup lang="ts">
import { STORAGE_NATIVE_SELECT_CLASS, type StorageSelectOption } from '~/utils/storage-wizard-ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: StorageSelectOption[]
    placeholder?: string
    disabled?: boolean
    inputId?: string
    ariaLabel?: string
  }>(),
  {
    modelValue: '',
    disabled: false,
    inputId: undefined,
    ariaLabel: undefined,
  },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const normalizedOptions = computed(() => {
  const opts = [...props.options]
  const current = props.modelValue
  if (current && !opts.some(o => o.value === current)) {
    opts.unshift({ value: current, label: current })
  }
  return opts
})

function onChange(e: Event) {
  emit('update:modelValue', (e.target as HTMLSelectElement).value)
}
</script>
