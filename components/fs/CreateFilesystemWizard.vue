<template>
  <LvmWizardModalShell
    :title="t('storage.fs.wizard.create_fs.title')"
    :step="step"
    :total-steps="3"
    icon="i-heroicons-folder"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UAlert
          v-if="!eligibleBackends.length"
          color="amber"
          variant="soft"
          :title="t('storage.fs.wizard.create_fs.no_backend')"
        />
        <UFormGroup :label="t('storage.fs.wizard.create_fs.backend')">
          <USelect
            v-model="backendPath"
            :options="backendOptions"
            :disabled="!backendOptions.length"
          />
        </UFormGroup>
        <UFormGroup :label="t('storage.fs.wizard.create_fs.fs_type')">
          <USelect v-model="fsType" :options="fsTypeOptions" />
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
      </template>

      <template v-else-if="step === 2">
        <UAlert v-if="preflightLoading" color="gray" variant="soft" :title="t('storage.fs.wizard.preflight_loading')" />
        <UAlert
          v-else-if="preflightBlockers"
          color="red"
          variant="soft"
          :title="t('storage.fs.wizard.preflight_blockers')"
          :description="preflightBlockers"
        />
        <template v-else-if="preflight">
          <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('storage.fs.wizard.command_preview') }}</p>
          <pre class="text-xs font-mono whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">{{ commandPreview }}</pre>
          <UAlert
            v-for="(w, i) in preflight.warnings"
            :key="i"
            color="amber"
            variant="soft"
            :description="w"
          />
        </template>
      </template>

      <template v-else>
        <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('storage.fs.wizard.destructive_intro') }}</p>
        <p class="font-mono text-sm font-semibold text-red-700 dark:text-red-300 select-all">{{ preflight?.requiredConfirmation }}</p>
        <UFormGroup :label="t('storage.fs.wizard.create_fs.confirm_phrase')">
          <UInput v-model="confirmation" class="font-mono" :placeholder="preflight?.requiredConfirmation" />
        </UFormGroup>
        <UAlert v-if="executeError" color="red" variant="soft" :description="executeError" />
      </template>
    </div>

    <template #footer>
      <div class="flex justify-between gap-2">
        <UButton v-if="step > 1" color="gray" variant="ghost" @click="step--">{{ t('storage.fs.wizard.back') }}</UButton>
        <span v-else />
        <div class="flex gap-2">
          <UButton color="gray" variant="ghost" @click="emit('cancel')">{{ t('storage.fs.wizard.cancel') }}</UButton>
          <UButton
            v-if="step < 3"
            color="primary"
            :disabled="(step === 1 && !step1Valid) || (step === 2 && !preflight?.ok)"
            :loading="preflightLoading"
            @click="onNext"
          >
            {{ t('storage.fs.wizard.next') }}
          </UButton>
          <UButton
            v-else
            color="primary"
            :loading="busy"
            :disabled="!canExecute"
            @click="execute"
          >
            {{ t('storage.fs.wizard.create_fs.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { FsBackendCandidate, FsType, PartitionStrategy } from '~/types/filesystem'
import { validateMountPoint, validateFsLabel } from '~/utils/fs-preflight-validation'
import { pickDefaultFsBackend } from '~/utils/fs-wizard-ui'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  candidates: FsBackendCandidate[]
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()
const toast = useAppToast()

const step = ref(1)
const backendPath = ref('')
const fsType = ref<FsType>('xfs')
const label = ref('fs01')
const mountPoint = ref('/mnt/vdisks/fs01')
const partitionStrategy = ref<PartitionStrategy>('none')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const preflightLoading = ref(false)
const busy = ref(false)
const executeError = ref<string | null>(null)

const eligibleBackends = computed(() => props.candidates.filter(c => c.eligible))
const backendOptions = computed(() =>
  eligibleBackends.value.map(c => ({
    label: c.displayName ? `${c.path} (${c.displayName})` : `${c.path} (${c.kind})`,
    value: c.path,
  })),
)
const fsTypeOptions = [
  { label: 'XFS', value: 'xfs' },
  { label: 'ext4', value: 'ext4' },
]
const partitionOptions = [
  { label: t('storage.fs.wizard.create_fs.partition_none'), value: 'none' },
  { label: t('storage.fs.wizard.create_fs.partition_gpt'), value: 'gpt' },
]

const step1Valid = computed(() =>
  !!backendPath.value
  && eligibleBackends.value.some(c => c.path === backendPath.value)
  && !validateMountPoint(mountPoint.value)
  && !validateFsLabel(label.value),
)

const preflightBlockers = computed(() => preflight.value?.blockers?.join(' · ') || '')
const commandPreview = computed(() => {
  const lines = [
    ...(preflight.value?.configPreview ?? []),
    ...(preflight.value?.commands ?? []),
  ]
  return lines.join('\n') || '—'
})

const canExecute = computed(() =>
  preflight.value?.ok
  && confirmation.value.trim() === preflight.value.requiredConfirmation,
)

onMounted(() => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  backendPath.value = pickDefaultFsBackend(eligibleBackends.value)
})

async function loadPreflight() {
  preflightLoading.value = true
  preflight.value = null
  try {
    preflight.value = await fs.preflight('create_fs', {
      backendPath: backendPath.value,
      fsType: fsType.value,
      label: label.value,
      mountPoint: mountPoint.value,
      partitionStrategy: partitionStrategy.value,
    })
  } catch (e: unknown) {
    preflight.value = { ok: false, blockers: [(e as Error).message], commands: [], configPreview: [], warnings: [] }
  } finally {
    preflightLoading.value = false
  }
}

async function onNext() {
  if (step.value === 1) {
    await loadPreflight()
    step.value = 2
    return
  }
  if (step.value === 2 && !preflight.value?.ok) return
  if (step.value === 2) {
    step.value = 3
    confirmation.value = ''
  }
}

async function execute() {
  if (!canExecute.value) return
  busy.value = true
  executeError.value = null
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
      confirmation: confirmation.value.trim(),
    }, clusterExecution)
    toast.success(t('storage.fs.wizard.create_fs.success'))
    emit('close')
  } catch (e: unknown) {
    executeError.value = (e as { message?: string })?.message ?? t('common.error')
  } finally {
    busy.value = false
  }
}
</script>
