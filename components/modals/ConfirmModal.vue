<template>
  <BaseModal
    :title="title"
    :icon="intent === 'danger' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-question-mark-circle'"
    :intent="intent ?? 'neutral'"
    size="sm"
    :closable="true"
    @cancel="$emit('cancel')"
  >
    <p class="text-ui-base text-gray-600 leading-relaxed">{{ message }}</p>

    <template #actions>
      <UButton
        color="gray"
        variant="outline"
        size="sm"
        :label="cancelLabel ?? 'Annuler'"
        @click="$emit('cancel')"
      />
      <UButton
        :color="intent === 'danger' ? 'red' : 'primary'"
        size="sm"
        :label="confirmLabel ?? 'Confirmer'"
        @click="$emit('confirm')"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
defineProps<{
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  intent?:       'neutral' | 'danger'
}>()
defineEmits(['confirm', 'cancel'])
</script>
