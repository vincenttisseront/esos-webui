<script setup lang="ts">
const props = withDefaults(defineProps<{
  dirty: boolean
  saving: boolean
  formValid?: boolean
}>(), {
  formValid: true,
})

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useEsosI18n()

const canSave = computed(() => props.formValid)
</script>

<template>
  <div
    v-if="dirty"
    class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3"
  >
    <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
      {{ t('admin.authProviders.save.unsavedChanges') }}
    </p>
    <div class="flex flex-col gap-2 sm:flex-row sm:shrink-0">
      <UButton
        :label="t('common.actions.cancel')"
        color="gray"
        variant="soft"
        size="sm"
        :disabled="saving"
        @click="emit('cancel')"
      />
      <UButton
        :label="t('admin.authProviders.save.saveButton')"
        icon="i-heroicons-check"
        size="sm"
        :loading="saving"
        :disabled="!canSave || saving"
        color="primary"
        @click="emit('save')"
      />
    </div>
  </div>
</template>
