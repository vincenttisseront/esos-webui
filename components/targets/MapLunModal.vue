<template>
  <FormModal
    :title="t('storage.hosts.luns.modals.map.title', { group: groupName })"
    :confirm-label="t('common.actions.confirm')"
    :loading="loading"
    @confirm="submit"
    @cancel="$emit('cancel')"
  >
    <UFormField :label="t('storage.hosts.luns.modals.map.deviceLabel')">
      <USelect
        v-model="deviceName"
        :items="deviceItems"
        value-key="value"
        label-key="label"
        :placeholder="t('storage.hosts.luns.modals.map.devicePlaceholder')"
        class="w-full"
      />
    </UFormField>
    <p v-if="deviceItems.length === 0" class="text-sm text-amber-600 mt-1">
      {{ t('storage.hosts.luns.modals.map.noDevices') }}
    </p>

    <UFormField :label="t('storage.hosts.luns.modals.map.lunIdLabel')" class="mt-3">
      <UInput v-model.number="lunId" type="number" min="0" max="65535" />
    </UFormField>
    <p class="text-xs text-gray-500 mt-1">
      {{ t('storage.hosts.luns.modals.map.lunIdHint', { ids: usedIdsLabel }) }}
    </p>

    <UCheckbox
      v-model="readOnly"
      class="mt-3"
      :label="t('storage.hosts.luns.modals.map.readOnlyLabel')"
    />

    <div v-if="previewLine" class="mt-3">
      <p class="text-xs font-semibold text-gray-500">{{ t('storage.hosts.luns.modals.map.previewLabel') }}</p>
      <pre class="text-xs font-mono bg-gray-50 dark:bg-gray-800 p-2 rounded mt-1 whitespace-pre-wrap">{{ previewLine }}</pre>
    </div>
    <p v-if="previewError" class="text-sm text-red-500 mt-2">{{ previewError }}</p>
    <ul v-if="preflightWarnings.length" class="text-xs text-amber-700 mt-2 list-disc pl-4">
      <li v-for="(w, i) in preflightWarnings" :key="i">{{ w }}</li>
    </ul>
  </FormModal>
</template>

<script setup lang="ts">
import FormModal from '~/components/modals/FormModal.vue'
import type { UnmappedDeviceInfo } from '~/types/scst-hosts'
import type { Overview, Target } from '~/types/esos'
import { validateMapLun, suggestNextLunId, buildLunPreviewLine } from '~/utils/scst-lun-validation'
import { mapLunValidationError } from '~/utils/scst-hosts-ui'

const { t } = useEsosI18n()
const { effective } = useSelectedSan()

const props = defineProps<{
  groupName: string
  target: Target
  overview: Overview
  unmappedDevices: UnmappedDeviceInfo[]
  loading?: boolean
  initialDeviceName?: string
}>()

const emit = defineEmits<{
  confirm: [payload: { lunId: number; deviceName: string; readOnly: boolean }]
  cancel: []
}>()

const group = computed(() => props.target.groups.find(g => g.name === props.groupName))

const deviceName = ref(props.initialDeviceName ?? '')
const readOnly = ref(false)
const lunId = ref(suggestNextLunId(group.value?.luns ?? []))
const preflightWarnings = ref<string[]>([])

const deviceItems = computed(() =>
  props.unmappedDevices
    .filter(d => d.handler === 'vdisk_blockio' || d.handler === 'vdisk_fileio')
    .map(d => ({ value: d.name, label: `${d.name} (${d.handler})` })),
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
  if (!deviceName.value) return ''
  const r = validateMapLun(
    { lunId: lunId.value, deviceName: deviceName.value, readOnly: readOnly.value },
    {
      config: validationConfig.value as import('~/types/esos').ScstConfig,
      target: props.target,
      groupName: props.groupName,
    },
  )
  if (r.ok) return ''
  return mapLunValidationError(r.errorKey, t)
})

const previewLine = computed(() => {
  if (previewError.value || !deviceName.value) return ''
  return buildLunPreviewLine(lunId.value, deviceName.value, readOnly.value)
})

async function runPreflight() {
  if (!deviceName.value || !effective.value?.id) return
  try {
    const res = await $fetch<{ warnings: string[] }>(
      `/api/targets/${encodeURIComponent(props.target.name)}/groups/${encodeURIComponent(props.groupName)}/luns/preflight`,
      {
        method: 'POST',
        body: { lunId: lunId.value, deviceName: deviceName.value, readOnly: readOnly.value },
        query: { sanId: effective.value.id },
      },
    )
    preflightWarnings.value = res.warnings ?? []
  } catch {
    preflightWarnings.value = []
  }
}

watch([deviceName, lunId, readOnly], () => { void runPreflight() })

function submit() {
  if (previewError.value || !deviceName.value) return
  emit('confirm', {
    lunId: lunId.value,
    deviceName: deviceName.value,
    readOnly: readOnly.value,
  })
}
</script>
