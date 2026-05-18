<template>
  <BaseModal
    :title="title"
    :subtitle="subtitle"
    :size="size ?? 'md'"
    :closable="true"
    @cancel="$emit('cancel')"
  >
    <slot />

    <template #actions>
      <UButton
        color="gray"
        variant="outline"
        size="sm"
        :label="cancelLabel ?? 'Annuler'"
        :disabled="loading"
        @click="$emit('cancel')"
      />
      <UButton
        color="primary"
        size="sm"
        type="submit"
        :label="confirmLabel ?? 'Enregistrer'"
        :loading="loading"
        @click="$emit('confirm')"
      />
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
defineProps<{
  title:         string
  subtitle?:     string
  confirmLabel?: string
  cancelLabel?:  string
  size?:         'sm' | 'md' | 'lg' | 'xl'
  loading?:      boolean
}>()
defineEmits(['confirm', 'cancel'])
</script>
