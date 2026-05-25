<script setup lang="ts">
const props = defineProps<{
  saving: boolean
  authProvidersReadOnly: boolean
  dirty: boolean
  formValid: boolean
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useEsosI18n()

const showActionBar = computed(() => !props.authProvidersReadOnly && props.dirty)
const showNoChanges = computed(() => !props.authProvidersReadOnly && !props.dirty)
</script>

<template>
  <div
    v-if="authProvidersReadOnly || showActionBar || showNoChanges"
    class="sticky bottom-0 z-10 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur"
  >
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <UAlert
        v-if="authProvidersReadOnly"
        color="blue"
        icon="i-heroicons-eye"
        :title="t('admin.authProviders.readonly.bannerTitle')"
        :description="t('admin.authProviders.readonly.bannerDesc')"
      />

      <p
        v-else-if="showNoChanges"
        class="text-sm text-center text-gray-500 dark:text-gray-400 py-1"
      >
        {{ t('admin.authProviders.save.noChanges') }}
      </p>

      <div
        v-else-if="showActionBar"
        class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
          {{ t('admin.authProviders.save.unsavedChanges') }}
        </p>
        <div class="flex flex-col gap-2 sm:flex-row sm:shrink-0">
          <UButton
            :label="t('common.actions.cancel')"
            color="gray"
            variant="soft"
            size="md"
            :disabled="saving"
            @click="emit('cancel')"
          />
          <UButton
            :label="t('admin.authProviders.save.saveButton')"
            icon="i-heroicons-check"
            size="md"
            :loading="saving"
            :disabled="!formValid || saving"
            color="primary"
            @click="emit('save')"
          />
        </div>
      </div>
    </div>
  </div>
</template>
