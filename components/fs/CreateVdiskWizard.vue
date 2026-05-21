<template>
  <LvmWizardModalShell :title="t('storage.fs.wizard.create_vdisk.title')" icon="i-heroicons-document-plus">
    <div class="space-y-3">
      <UFormGroup :label="t('storage.fs.wizard.create_vdisk.mount')">
        <USelect v-model="mountPoint" :options="mountOptions" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_vdisk.file_name')">
        <UInput v-model="fileName" placeholder="data01.img" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_vdisk.size')">
        <UInput v-model.number="sizeBytes" type="number" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_vdisk.alloc')">
        <USelect v-model="allocMode" :options="['fallocate', 'dd']" />
      </UFormGroup>
      <UFormGroup v-if="preflight?.requiredConfirmation" :label="t('storage.fs.wizard.create_fs.confirm_phrase')">
        <UInput v-model="confirmation" />
      </UFormGroup>
      <UAlert v-if="preflightBlockers" color="red" variant="soft" :description="preflightBlockers" />
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('close')">{{ t('common.actions.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">
          {{ t('storage.fs.wizard.create_vdisk.execute') }}
        </UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { FileSystemMount } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  mounts: FileSystemMount[]
}>()
const emit = defineEmits<{ close: []; done: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()

const mountPoint = ref('')
const fileName = ref('data01.img')
const sizeBytes = ref(1024 * 1024 * 1024)
const allocMode = ref<'fallocate' | 'dd'>('fallocate')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const busy = ref(false)

const mountOptions = computed(() => props.mounts.map(m => ({ label: m.mountPoint, value: m.mountPoint })))
const preflightBlockers = computed(() => preflight.value?.blockers?.join(', ') || '')

watch([mountPoint, fileName, sizeBytes, allocMode], runPre, { immediate: true })
onMounted(() => {
  if (mountOptions.value[0]) mountPoint.value = mountOptions.value[0].value
})

async function runPre() {
  if (!mountPoint.value) return
  preflight.value = await fs.preflight('create_vdisk', {
    mountPoint: mountPoint.value,
    fileName: fileName.value,
    sizeBytes: sizeBytes.value,
    allocMode: allocMode.value,
  })
}

async function execute() {
  busy.value = true
  try {
    const clusterExecution = props.isClustered && props.clusterId
      ? { clusterId: props.clusterId, primarySanId: props.sanId }
      : undefined
    await fs.createVdisk({
      mountPoint: mountPoint.value,
      fileName: fileName.value,
      sizeBytes: sizeBytes.value,
      allocMode: allocMode.value,
      confirmation: confirmation.value,
    }, clusterExecution)
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>
