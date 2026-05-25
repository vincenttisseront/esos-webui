<template>
  <FormModal
    :title="modalTitle"
    :confirm-label="t('common.actions.confirm')"
    :loading="loading || preflightLoading"
    :confirm-disabled="!canConfirm"
    @confirm="submit"
    @cancel="$emit('cancel')"
  >
    <UFormField v-if="showTargetSelect" :label="t('storage.hosts.wizard.selectTarget')">
      <USelect
        v-model="selectedTarget"
        :items="targetItems"
        value-key="value"
        label-key="label"
        :placeholder="t('storage.hosts.wizard.selectTargetPlaceholder')"
        @update:model-value="onTargetChange"
      />
    </UFormField>
    <UFormField
      v-if="showGroupSelect"
      :label="t('storage.hosts.wizard.selectGroup')"
      :class="showTargetSelect ? 'mt-3' : ''"
    >
      <USelect
        v-model="selectedGroup"
        :items="groupItems"
        value-key="value"
        label-key="label"
        :placeholder="t('storage.hosts.wizard.selectGroupPlaceholder')"
        :disabled="!selectedTarget"
      />
    </UFormField>
    <UFormField :label="t('storage.hosts.modals.addInitiator.typeLabel')" class="mt-3">
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
    <ul v-if="preflightWarnings.length" class="text-sm text-amber-700 dark:text-amber-300 mt-2 list-disc pl-4">
      <li v-for="(w, i) in preflightWarnings" :key="i">{{ w }}</li>
    </ul>
    <details v-if="preflightPreview.length" class="mt-2">
      <summary class="text-xs cursor-pointer text-gray-500">{{ t('storage.hosts.modals.addInitiator.preflightPreview') }}</summary>
      <pre class="text-[11px] mt-1 font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ preflightPreview.join('\n') }}</pre>
    </details>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import { validateInitiatorValue, type InitiatorType } from '~/utils/scst-initiator-validation'
import { mapHostsValidationError } from '~/utils/scst-hosts-ui'
import type { ScstPreflightResult } from '~/types/scst-hosts'
import type { Target } from '~/types/esos'

const { t } = useEsosI18n()
const props = defineProps<{
  groupName?: string
  targetName?: string
  targets?: Target[]
  loading?: boolean
  initialValue?: string
  runPreflight?: (
    target: string,
    group: string,
    initiator: string,
    type: InitiatorType,
  ) => Promise<ScstPreflightResult>
}>()
const emit = defineEmits<{
  confirm: [payload: { targetName: string; groupName: string; initiator: string; type: InitiatorType }]
  cancel: []
}>()

const value = ref(props.initialValue ?? '')
const type = ref<InitiatorType>('auto')
const selectedTarget = ref(props.targetName ?? '')
const selectedGroup = ref(props.groupName ?? '')

const preflightLoading = ref(false)
const preflightPreview = ref<string[]>([])
const preflightWarnings = ref<string[]>([])
const preflightBlockers = ref<string[]>([])

const showTargetSelect = computed(() => !props.targetName && (props.targets?.length ?? 0) > 0)
const showGroupSelect = computed(() => !props.groupName && showTargetSelect.value)

const targetItems = computed(() =>
  (props.targets ?? []).map(tg => ({ value: tg.name, label: tg.name })),
)

const groupItems = computed(() => {
  const tg = (props.targets ?? []).find(x => x.name === selectedTarget.value)
  return (tg?.groups ?? []).map(g => ({ value: g.name, label: g.name }))
})

const effectiveTarget = computed(() => props.targetName ?? selectedTarget.value)
const effectiveGroup = computed(() => props.groupName ?? selectedGroup.value)

const modalTitle = computed(() =>
  effectiveGroup.value
    ? t('storage.hosts.modals.addInitiator.title', { group: effectiveGroup.value })
    : t('storage.hosts.wizard.addInitiator.title'),
)

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

const canConfirm = computed(() => {
  const r = validateInitiatorValue(value.value, { type: type.value })
  if (!r.ok || !effectiveTarget.value || !effectiveGroup.value) return false
  if (preflightBlockers.value.length) return false
  return true
})

function onTargetChange() {
  selectedGroup.value = ''
}

let preflightTimer: ReturnType<typeof setTimeout> | undefined

async function runPreflightCheck() {
  const tg = effectiveTarget.value
  const grp = effectiveGroup.value
  const r = validateInitiatorValue(value.value, { type: type.value })
  if (!props.runPreflight || !tg || !grp || !r.ok || !r.normalized) {
    preflightPreview.value = []
    preflightWarnings.value = []
    preflightBlockers.value = []
    return
  }
  preflightLoading.value = true
  try {
    const res = await props.runPreflight(tg, grp, r.normalized, type.value)
    preflightPreview.value = res.configPreview
    preflightWarnings.value = res.warnings
    preflightBlockers.value = res.blockers
  } catch {
    preflightPreview.value = []
    preflightWarnings.value = []
    preflightBlockers.value = []
  } finally {
    preflightLoading.value = false
  }
}

watch([value, type, effectiveTarget, effectiveGroup], () => {
  clearTimeout(preflightTimer)
  preflightTimer = setTimeout(runPreflightCheck, 400)
})

function submit() {
  const r = validateInitiatorValue(value.value, { type: type.value })
  if (!r.ok || !r.normalized || !effectiveTarget.value || !effectiveGroup.value) return
  emit('confirm', {
    targetName: effectiveTarget.value,
    groupName: effectiveGroup.value,
    initiator: r.normalized,
    type: type.value,
  })
}
</script>
