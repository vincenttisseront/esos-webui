<template>
  <LvmWizardModalShell :title="t('storage.fs.wizard.fileio.title')" icon="i-heroicons-circle-stack">
    <div class="space-y-3">
      <p class="text-sm font-mono break-all">{{ vdisk?.path }}</p>
      <UFormGroup :label="t('storage.fs.wizard.fileio.device_name')">
        <UInput v-model="deviceName" />
      </UFormGroup>
      <UCheckbox v-model="nvCache" :label="t('storage.fs.wizard.fileio.nv_cache')" />
      <UFormGroup v-if="preflight?.requiredConfirmation" :label="t('storage.fs.wizard.create_fs.confirm_phrase')">
        <UInput v-model="confirmation" />
      </UFormGroup>
      <UAlert v-if="preflightBlockers" color="red" variant="soft" :description="preflightBlockers" />
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('close')">{{ t('common.actions.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">
          {{ t('storage.fs.wizard.fileio.execute') }}
        </UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import { suggestedScstDeviceName } from '~/utils/lvm-scst-device-ui'
import type { VDiskFile } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  vdisk: VDiskFile | null
}>()
const emit = defineEmits<{ close: []; done: [payload: { route: string; query?: Record<string, string> }] }>()
const { t } = useEsosI18n()
const fs = useFsStore()

const deviceName = ref('')
const nvCache = ref(true)
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const busy = ref(false)

const preflightBlockers = computed(() => preflight.value?.blockers?.join(', ') || '')

watch(() => props.vdisk, (v) => {
  if (v) {
    const base = v.fileName.replace(/\.img$/i, '').replace(/[^A-Za-z0-9_-]/g, '_')
    deviceName.value = suggestedScstDeviceName('vdisk', base)
    runPre()
  }
}, { immediate: true })

watch([deviceName, nvCache], runPre)

async function runPre() {
  if (!props.vdisk) return
  preflight.value = await fs.preflight('bind_fileio', {
    deviceName: deviceName.value,
    vdiskPath: props.vdisk.path,
    nvCache: nvCache.value,
  })
}

async function execute() {
  if (!props.vdisk) return
  busy.value = true
  try {
    const clusterExecution = props.isClustered && props.clusterId
      ? { clusterId: props.clusterId, primarySanId: props.sanId }
      : undefined
    const res = await fs.bindFileio({
      deviceName: deviceName.value,
      vdiskPath: props.vdisk.path,
      nvCache: nvCache.value,
      confirmation: confirmation.value,
    }, clusterExecution)
    emit('done', res.nextAction ?? { route: '/targets', query: { exposeDevice: res.deviceName } })
  } finally {
    busy.value = false
  }
}
</script>
