<template>
  <div :class="formFieldClass">
    <label
      v-if="label"
      :for="resolvedId"
      :class="formLabelClass"
    >
      {{ label }}
      <span v-if="required" :class="formLabelRequiredClass" aria-hidden="true">*</span>
    </label>

    <div class="min-w-0">
      <slot :input-id="resolvedId" />
    </div>

    <p
      v-if="help"
      :id="helpId"
      :class="formHelpClass"
    >
      {{ help }}
    </p>

    <p
      v-if="error"
      :id="errorId"
      :class="formErrorClass"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import {
  formFieldClass,
  formHelpClass,
  formLabelClass,
  formLabelRequiredClass,
  formErrorClass,
} from '~/utils/form-field-styles'

const props = withDefaults(
  defineProps<{
    label?: string
    help?: string
    error?: string | null
    required?: boolean
    /** Explicit control id; auto-generated when omitted. */
    inputId?: string
  }>(),
  {
    label: undefined,
    help: undefined,
    error: null,
    required: false,
    inputId: undefined,
  },
)

const autoId = useId()
const resolvedId = computed(() => props.inputId ?? autoId.replace(/:/g, ''))
const helpId = computed(() => `${resolvedId.value}-help`)
const errorId = computed(() => `${resolvedId.value}-error`)

provide('appFormFieldControlId', resolvedId)
provide('appFormFieldHelpId', computed(() => (props.help ? helpId.value : undefined)))
provide('appFormFieldErrorId', computed(() => (props.error ? errorId.value : undefined)))
</script>
