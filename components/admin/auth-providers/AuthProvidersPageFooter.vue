<script setup lang="ts">
defineProps<{
  saving: boolean
  readOnly: boolean
}>()

const emit = defineEmits<{
  save: []
}>()

const { t } = useEsosI18n()
</script>

<template>
  <div
    class="sticky bottom-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur"
  >
    <UAlert
      v-if="readOnly"
      color="blue"
      icon="i-heroicons-eye"
      class="mb-3"
      :title="t('admin.authProviders.readonly.bannerTitle')"
      :description="t('admin.authProviders.readonly.bannerDesc')"
    />
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-6xl mx-auto">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.save.actionsIntro') }}
      </p>
      <div class="flex flex-col gap-2 sm:flex-row">
        <UButton
          v-if="!readOnly"
          :label="t('admin.authProviders.save.saveButton')"
          icon="i-heroicons-check"
          size="lg"
          :loading="saving"
          color="primary"
          @click="emit('save')"
        />
        <UButton
          to="/admin"
          color="gray"
          variant="soft"
          :label="t('common.actions.cancel')"
          size="lg"
        />
      </div>
    </div>
  </div>
</template>
