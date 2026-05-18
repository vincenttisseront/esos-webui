<template>
  <BaseModal
    :title="title"
    :icon="iconByLevel"
    :intent="intentByLevel"
    size="sm"
    :closable="false"
    @cancel="$emit('close')"
  >
    <p class="text-ui-base text-gray-600 leading-relaxed">{{ message }}</p>

    <template #actions>
      <UButton
        :color="level === 'error' ? 'red' : 'primary'"
        size="sm"
        label="OK"
        @click="$emit('close')"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  title:   string
  message: string
  level?:  'info' | 'warning' | 'error'
}>()
defineEmits(['close'])

const iconByLevel = computed(() => ({
  info:    'i-heroicons-information-circle',
  warning: 'i-heroicons-exclamation-triangle',
  error:   'i-heroicons-x-circle',
}[props.level ?? 'info']))

const intentByLevel = computed(() => ({
  info:    'info',
  warning: 'warning',
  error:   'danger',
}[props.level ?? 'info'] as 'info' | 'warning' | 'danger'))
</script>
