<template>
  <BaseModal
    :title="title"
    :icon="intent === 'danger' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-question-mark-circle'"
    :intent="intent ?? 'neutral'"
    size="sm"
    :closable="true"
    @cancel="$emit('cancel')"
  >
    <p class="text-ui-base text-gray-600 dark:text-gray-400 leading-relaxed">{{ message }}</p>

    <template #actions>
      <UButton
        color="gray"
        variant="outline"
        size="sm"
        :label="cancelText"
        @click="$emit('cancel')"
      />
      <UButton
        :color="intent === 'danger' ? 'red' : 'primary'"
        size="sm"
        :label="confirmText"
        @click="$emit('confirm')"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()

const props = defineProps<{
  title:         string
  message:       string
  confirmLabel?: string
  cancelLabel?:  string
  intent?:       'neutral' | 'danger'
}>()

const cancelText = computed(() => props.cancelLabel ?? (t('common.actions.cancel') as string))
const confirmText = computed(() => props.confirmLabel ?? (t('common.actions.confirm') as string))

defineEmits(['confirm', 'cancel'])
</script>
