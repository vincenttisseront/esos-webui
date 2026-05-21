<template>
  <FormModal
    :title="t('storage.hosts.modals.addGroup.title')"
    :confirm-label="t('common.actions.confirm')"
    :loading="loading"
    @confirm="submit"
    @cancel="$emit('cancel')"
  >
    <UFormField :label="t('storage.hosts.modals.addGroup.nameLabel')">
      <UInput
        v-model="name"
        :placeholder="t('storage.hosts.modals.addGroup.namePlaceholder')"
        autofocus
      />
    </UFormField>
    <p v-if="previewError" class="text-sm text-red-500 mt-2">{{ previewError }}</p>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import { validateGroupName } from '~/utils/scst-initiator-validation'
import { mapHostsValidationError } from '~/utils/scst-hosts-ui'

const { t } = useEsosI18n()
const emit = defineEmits<{ confirm: [groupName: string]; cancel: [] }>()
defineProps<{ loading?: boolean }>()

const name = ref('')
const previewError = computed(() => {
  const r = validateGroupName(name.value)
  if (r.ok || !name.value.trim()) return ''
  return mapHostsValidationError(r.errorKey, t)
})

function submit() {
  const r = validateGroupName(name.value)
  if (!r.ok || !r.normalized) return
  emit('confirm', r.normalized)
}
</script>
