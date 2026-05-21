<template>
  <LvmWizardModalShell :title="t('storage.fs.wizard.create_fs.title')" icon="i-heroicons-folder">
    <div class="space-y-3">
      <UFormGroup :label="t('storage.fs.wizard.create_fs.backend')">
        <USelect v-model="backendPath" :options="backendOptions" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_fs.fs_type')">
        <USelect v-model="fsType" :options="['xfs', 'ext4']" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_fs.label')">
        <UInput v-model="label" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_fs.mount_point')">
        <UInput v-model="mountPoint" placeholder="/mnt/vdisks/fs01" />
      </UFormGroup>
      <UFormGroup :label="t('storage.fs.wizard.create_fs.partition')">
        <USelect v-model="partitionStrategy" :options="partitionOptions" />
      </UFormGroup>
      <UAlert v-if="preflight?.commands?.length" color="gray" variant="soft">
        <pre class="text-xs font-mono whitespace-pre-wrap">{{ preflight.commands.join('\n') }}</pre>
      </UAlert>
      <UAlert v-if="preflightBlockers" color="red" variant="soft" :description="preflightBlockers" />
      <UFormGroup v-if="preflight?.requiredConfirmation" :label="t('storage.fs.wizard.create_fs.confirm_phrase')">
        <UInput v-model="confirmation" />
      </UFormGroup>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="emit('close')">{{ t('common.actions.cancel') }}</UButton>
        <UButton color="primary" :loading="busy" :disabled="!preflight?.ok" @click="execute">
          {{ t('storage.fs.wizard.create_fs.execute') }}
        </UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { FsBackendCandidate, FsType, PartitionStrategy } from '~/types/filesystem'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  candidates: FsBackendCandidate[]
}>()
const emit = defineEmits<{ close: []; done: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()

const backendPath = ref('')
const fsType = ref<FsType>('xfs')
const label = ref('fs01')
const mountPoint = ref('/mnt/vdisks/fs01')
const partitionStrategy = ref<PartitionStrategy>('none')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const busy = ref(false)

const backendOptions = computed(() =>
  props.candidates.filter(c => c.eligible).map(c => ({ label: `${c.path} (${c.kind})`, value: c.path })),
)
const partitionOptions = [
  { label: t('storage.fs.wizard.create_fs.partition_none'), value: 'none' },
  { label: t('storage.fs.wizard.create_fs.partition_gpt'), value: 'gpt' },
]
const preflightBlockers = computed(() => preflight.value?.blockers?.join(', ') || '')

watch([backendPath, fsType, label, mountPoint, partitionStrategy], runPre, { immediate: true })

onMounted(() => {
  if (backendOptions.value[0]) backendPath.value = backendOptions.value[0].value
})

async function runPre() {
  if (!backendPath.value) return
  preflight.value = await fs.preflight('create_fs', {
    backendPath: backendPath.value,
    fsType: fsType.value,
    label: label.value,
    mountPoint: mountPoint.value,
    partitionStrategy: partitionStrategy.value,
  })
}

async function execute() {
  busy.value = true
  try {
    const clusterExecution = props.isClustered && props.clusterId
      ? { clusterId: props.clusterId, primarySanId: props.sanId }
      : undefined
    await fs.createFilesystem({
      backendPath: backendPath.value,
      fsType: fsType.value,
      label: label.value,
      mountPoint: mountPoint.value,
      partitionStrategy: partitionStrategy.value,
      confirmation: confirmation.value,
    }, clusterExecution)
    emit('done')
  } finally {
    busy.value = false
  }
}
</script>
