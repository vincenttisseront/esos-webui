<template>
  <select
    :value="modelValue"
    :disabled="disabled"
    :class="LVM_NATIVE_SELECT_CLASS"
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
import { LVM_NATIVE_SELECT_CLASS, type LvmSelectOption } from '~/utils/lvm-wizard-ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: LvmSelectOption[]
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    disabled: false,
  },
)

const emit = defineEmits<{ 'update:modelValue': [string] }>()

/** Keep current value visible even if it is no longer in the options list (e.g. force toggled). */
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
