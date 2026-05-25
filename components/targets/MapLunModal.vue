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

    <UFormField
      :label="t('storage.hosts.luns.modals.map.deviceLabel')"
      :class="showGroupSelect || showTargetSelect ? 'mt-3' : ''"
    >
      <USelect
        v-model="deviceName"
        :items="deviceItems"
        value-key="value"
        label-key="label"
        :placeholder="t('storage.hosts.luns.modals.map.devicePlaceholder')"
        class="w-full"
        :disabled="!effectiveGroup"
      />
    </UFormField>
    <p v-if="deviceItems.length === 0" class="text-sm text-amber-600 dark:text-amber-400 mt-1">
      {{ t('storage.hosts.luns.modals.map.noDevices') }}
    </p>

    <UFormField :label="t('storage.hosts.luns.modals.map.lunIdLabel')" class="mt-3">
      <UInput v-model.number="lunId" type="number" min="0" max="65535" :disabled="!effectiveGroup" />
    </UFormField>
    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
      {{ t('storage.hosts.luns.modals.map.lunIdHint', { ids: usedIdsLabel }) }}
    </p>

    <UCheckbox
      v-model="readOnly"
      class="mt-3"
      :label="t('storage.hosts.luns.modals.map.readOnlyLabel')"
      :disabled="!effectiveGroup"
    />

    <div v-if="previewLine" class="mt-3">
      <p class="text-xs font-semibold text-gray-500 dark:text-gray-400">{{ t('storage.hosts.luns.modals.map.previewLabel') }}</p>
      <pre class="text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap">{{ previewLine }}</pre>
    </div>
    <p v-if="previewError" class="text-sm text-red-500 mt-2">{{ previewError }}</p>
    <ul v-if="preflightWarnings.length" class="text-xs text-amber-700 dark:text-amber-300 mt-2 list-disc pl-4">
      <li v-for="(w, i) in preflightWarnings" :key="i">{{ w }}</li>
    </ul>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import type { ScstPreflightResult, UnmappedDeviceInfo } from '~/types/scst-hosts'
import type { Overview, Target } from '~/types/esos'
import { validateMapLun, suggestNextLunId, buildLunPreviewLine } from '~/utils/scst-lun-validation'
import { mapLunValidationError } from '~/utils/scst-hosts-ui'
import { listUnmappedDevicesForMap } from '~/utils/scst-unmapped-devices'

const { t } = useEsosI18n()
const { effective } = useSelectedSan()

const props = defineProps<{
  title?: string
  targetName?: string
  groupName?: string
  target?: Target
  targets?: Target[]
  overview: Overview
  unmappedDevices?: UnmappedDeviceInfo[]
  loading?: boolean
  initialDeviceName?: string
  runPreflight?: (
    target: string,
    group: string,
    lunId: number,
    deviceName: string,
    readOnly: boolean,
  ) => Promise<ScstPreflightResult>
}>()

const emit = defineEmits<{
  confirm: [payload: {
    targetName: string
    groupName: string
    lunId: number
    deviceName: string
    readOnly: boolean
  }]
  cancel: []
}>()

const selectedTarget = ref(props.targetName ?? props.target?.name ?? '')
const selectedGroup = ref(props.groupName ?? '')
const deviceName = ref(props.initialDeviceName ?? '')
const readOnly = ref(false)
const lunId = ref(0)

const preflightLoading = ref(false)
const preflightWarnings = ref<string[]>([])
const preflightBlockers = ref<string[]>([])

const showTargetSelect = computed(() => !props.target && !props.targetName && (props.targets?.length ?? 0) > 0)
const showGroupSelect = computed(() => !props.groupName && showTargetSelect.value)

const targetItems = computed(() =>
  (props.targets ?? []).map(tg => ({ value: tg.name, label: tg.name })),
)

const groupItems = computed(() => {
  const tg = resolveTargetObject.value
  return (tg?.groups ?? []).map(g => ({ value: g.name, label: g.name }))
})

const effectiveTargetName = computed(() => props.targetName ?? props.target?.name ?? selectedTarget.value)

const resolveTargetObject = computed((): Target | null => {
  if (props.target) return props.target
  const name = effectiveTargetName.value
  if (!name) return null
  return (props.targets ?? []).find(tg => tg.name === name) ?? null
})

const effectiveGroup = computed(() => props.groupName ?? selectedGroup.value)

const modalTitle = computed(() => {
  if (props.title) return props.title
  const grp = effectiveGroup.value
  if (grp) {
    return t('storage.hosts.luns.modals.map.title', { group: grp }) as string
  }
  return t('storage.hosts.wizard.mapLun.title') as string
})

const unmappedList = computed(() =>
  props.unmappedDevices ?? listUnmappedDevicesForMap(props.overview),
)

function handlerShortLabel(handler: string): string {
  if (handler === 'vdisk_blockio') return 'blockio'
  if (handler === 'vdisk_fileio') return 'fileio'
  return handler
}

const deviceItems = computed(() =>
  unmappedList.value.map(d => ({
    value: d.name,
    label: `${d.name} (${handlerShortLabel(d.handler)})`,
  })),
)

const group = computed(() =>
  resolveTargetObject.value?.groups.find(g => g.name === effectiveGroup.value),
)

const usedIdsLabel = computed(() => {
  const ids = group.value?.luns.map(l => l.id) ?? []
  return ids.length ? ids.join(', ') : '—'
})

const validationConfig = computed(() => {
  const byHandler = new Map<string, typeof props.overview.devices>()
  for (const d of props.overview.devices) {
    const list = byHandler.get(d.handler) ?? []
    list.push(d)
    byHandler.set(d.handler, list)
  }
  return {
    handlers: [...byHandler.entries()].map(([name, devices]) => ({
      name,
      devices: devices.map(d => ({
        name: d.name,
        handler: d.handler,
        filename: d.filename,
        attrs: d.attrs ?? {},
      })),
    })),
    drivers: [],
  }
})

const previewError = computed(() => {
  if (!deviceName.value || !resolveTargetObject.value || !effectiveGroup.value) return ''
  const r = validateMapLun(
    { lunId: lunId.value, deviceName: deviceName.value, readOnly: readOnly.value },
    {
      config: validationConfig.value as import('~/types/esos').ScstConfig,
      target: resolveTargetObject.value,
      groupName: effectiveGroup.value,
    },
  )
  if (r.ok) return ''
  return mapLunValidationError(r.errorKey, t)
})

const previewLine = computed(() => {
  if (previewError.value || !deviceName.value) return ''
  return buildLunPreviewLine(lunId.value, deviceName.value, readOnly.value)
})

const canConfirm = computed(() => {
  if (!effectiveTargetName.value || !effectiveGroup.value || !deviceName.value) return false
  if (previewError.value) return false
  if (preflightBlockers.value.length) return false
  return true
})

function onTargetChange() {
  selectedGroup.value = ''
  resetLunId()
}

function resetLunId() {
  lunId.value = suggestNextLunId(group.value?.luns ?? [])
}

watch(effectiveGroup, () => {
  resetLunId()
}, { immediate: true })

let preflightTimer: ReturnType<typeof setTimeout> | undefined

async function runPreflightCheck() {
  const tg = effectiveTargetName.value
  const grp = effectiveGroup.value
  if (!deviceName.value || !tg || !grp) {
    preflightWarnings.value = []
    preflightBlockers.value = []
    return
  }
  if (previewError.value) {
    preflightWarnings.value = []
    preflightBlockers.value = []
    return
  }

  preflightLoading.value = true
  try {
    let res: ScstPreflightResult
    if (props.runPreflight) {
      res = await props.runPreflight(tg, grp, lunId.value, deviceName.value, readOnly.value)
    } else if (effective.value?.id) {
      res = await $fetch<ScstPreflightResult>(
        `/api/targets/${encodeURIComponent(tg)}/groups/${encodeURIComponent(grp)}/luns/preflight`,
        {
          method: 'POST',
          body: { lunId: lunId.value, deviceName: deviceName.value, readOnly: readOnly.value },
          query: { sanId: effective.value.id },
        },
      )
    } else {
      return
    }
    preflightWarnings.value = res.warnings
    preflightBlockers.value = res.blockers
  } catch {
    preflightWarnings.value = []
    preflightBlockers.value = []
  } finally {
    preflightLoading.value = false
  }
}

watch([deviceName, lunId, readOnly, effectiveTargetName, effectiveGroup], () => {
  clearTimeout(preflightTimer)
  preflightTimer = setTimeout(runPreflightCheck, 400)
})

function submit() {
  if (!canConfirm.value || !effectiveTargetName.value || !effectiveGroup.value) return
  emit('confirm', {
    targetName: effectiveTargetName.value,
    groupName: effectiveGroup.value,
    lunId: lunId.value,
    deviceName: deviceName.value,
    readOnly: readOnly.value,
  })
}
</script>
