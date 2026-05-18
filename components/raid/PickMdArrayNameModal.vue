<template>
  <BaseModal
    :title="t('raid.stopped_md.pick_md_name_title')"
    icon="i-heroicons-server-stack"
    intent="info"
    size="sm"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-3">
      <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.stopped_md.pick_md_name_help') }}</p>
      <UFormGroup :label="t('raid.stopped_md.pick_md_name_label')">
        <UInput v-model="mdName" placeholder="md0" class="font-mono" @keyup.enter="submit" />
      </UFormGroup>
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
    </div>
    <template #actions>
      <UButton color="gray" variant="outline" size="sm" @click="$emit('cancel')">Annuler</UButton>
      <UButton color="primary" size="sm" :disabled="!mdName.trim()" @click="submit">Continuer</UButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
const { t } = useEsosI18n()
const mdName = ref('md0')
const error = ref('')

const emit = defineEmits<{
  confirm: [name: string]
  cancel: []
}>()

function submit() {
  const name = mdName.value.trim().toLowerCase()
  if (!/^md[a-z0-9_-]{0,15}$/.test(name)) {
    error.value = 'Nom invalide (ex. md0, md1)'
    return
  }
  emit('confirm', name)
}
</script>
