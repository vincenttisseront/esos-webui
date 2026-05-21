<template>
  <FormModal
    :title="t('storage.hosts.modals.addInitiator.title', { group: groupName })"
    :confirm-label="t('common.actions.confirm')"
    :loading="loading"
    @confirm="submit"
    @cancel="$emit('cancel')"
  >
    <UFormField :label="t('storage.hosts.modals.addInitiator.typeLabel')">
      <USelect
        v-model="type"
        :items="typeItems"
        value-key="value"
        label-key="label"
      />
    </UFormField>
    <UFormField :label="t('storage.hosts.modals.addInitiator.valueLabel')" class="mt-3">
      <UInput
        v-model="value"
        :placeholder="t('storage.hosts.modals.addInitiator.valuePlaceholder')"
      />
    </UFormField>
    <p v-if="previewError" class="text-sm text-red-500 mt-2">{{ previewError }}</p>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import { validateInitiatorValue, type InitiatorType } from '~/utils/scst-initiator-validation'
import { mapHostsValidationError } from '~/utils/scst-hosts-ui'

const { t } = useEsosI18n()
const props = defineProps<{ groupName: string; loading?: boolean; initialValue?: string }>()
const emit = defineEmits<{
  confirm: [payload: { initiator: string; type: InitiatorType }]
  cancel: []
}>()

const value = ref(props.initialValue ?? '')
const type = ref<InitiatorType>('auto')

const typeItems = computed(() =>
  (['auto', 'fc', 'iscsi', 'ib', 'pattern'] as InitiatorType[]).map(v => ({
    value: v,
    label: t(`storage.hosts.modals.addInitiator.types.${v}`),
  })),
)

const previewError = computed(() => {
  const r = validateInitiatorValue(value.value, { type: type.value })
  if (r.ok || !value.value.trim()) return ''
  return mapHostsValidationError(r.errorKey, t)
})

function submit() {
  const r = validateInitiatorValue(value.value, { type: type.value })
  if (!r.ok || !r.normalized) return
  emit('confirm', { initiator: r.normalized, type: type.value })
}
</script>
