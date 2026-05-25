<template>
  <FormModal
    :title="title ?? t('storage.hosts.modals.addGroup.title')"
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
      />
    </UFormField>
    <UFormField :label="t('storage.hosts.modals.addGroup.nameLabel')" :class="showTargetSelect ? 'mt-3' : ''">
      <UInput
        v-model="name"
        :placeholder="t('storage.hosts.modals.addGroup.namePlaceholder')"
        autofocus
      />
    </UFormField>
    <p v-if="previewError" class="text-sm text-red-500 mt-2">{{ previewError }}</p>
    <ul v-if="preflightWarnings.length" class="text-sm text-amber-700 dark:text-amber-300 mt-2 list-disc pl-4">
      <li v-for="(w, i) in preflightWarnings" :key="i">{{ w }}</li>
    </ul>
    <details v-if="preflightPreview.length" class="mt-2">
      <summary class="text-xs cursor-pointer text-gray-500">{{ t('storage.hosts.modals.addGroup.preflightPreview') }}</summary>
      <pre class="text-[11px] mt-1 font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ preflightPreview.join('\n') }}</pre>
    </details>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import { validateGroupName } from '~/utils/scst-initiator-validation'
import { mapHostsValidationError } from '~/utils/scst-hosts-ui'
import type { ScstPreflightResult } from '~/types/scst-hosts'
import type { Target } from '~/types/esos'

const { t } = useEsosI18n()
const props = defineProps<{
  loading?: boolean
  title?: string
  /** Fixed target (detail page); omit to show target selector. */
  targetName?: string
  targets?: Target[]
  runPreflight?: (target: string, groupName: string) => Promise<ScstPreflightResult>
}>()
const emit = defineEmits<{ confirm: [payload: { targetName: string; groupName: string }]; cancel: [] }>()

const name = ref('')
const selectedTarget = ref(props.targetName ?? '')
const preflightLoading = ref(false)
const preflightPreview = ref<string[]>([])
const preflightWarnings = ref<string[]>([])
const preflightBlockers = ref<string[]>([])

const showTargetSelect = computed(() => !props.targetName && (props.targets?.length ?? 0) > 0)

const targetItems = computed(() =>
  (props.targets ?? []).map(tg => ({ value: tg.name, label: tg.name })),
)

const effectiveTarget = computed(() => props.targetName ?? selectedTarget.value)

const previewError = computed(() => {
  const r = validateGroupName(name.value)
  if (r.ok || !name.value.trim()) return ''
  return mapHostsValidationError(r.errorKey, t)
})

const canConfirm = computed(() => {
  const r = validateGroupName(name.value)
  if (!r.ok || !effectiveTarget.value) return false
  if (preflightBlockers.value.length) return false
  return true
})

let preflightTimer: ReturnType<typeof setTimeout> | undefined

async function runPreflightCheck() {
  const tg = effectiveTarget.value
  const r = validateGroupName(name.value)
  if (!props.runPreflight || !tg || !r.ok || !r.normalized) {
    preflightPreview.value = []
    preflightWarnings.value = []
    preflightBlockers.value = []
    return
  }
  preflightLoading.value = true
  try {
    const res = await props.runPreflight(tg, r.normalized)
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

watch([name, effectiveTarget], () => {
  clearTimeout(preflightTimer)
  preflightTimer = setTimeout(runPreflightCheck, 400)
})

function submit() {
  const r = validateGroupName(name.value)
  if (!r.ok || !r.normalized || !effectiveTarget.value) return
  emit('confirm', { targetName: effectiveTarget.value, groupName: r.normalized })
}
</script>
