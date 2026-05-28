<template>
  <LvmWizardModalShell
    :title="t('storage.fs.wizard.create_vdisk.title')"
    :step="step"
    :total-steps="3"
    icon="i-heroicons-document-plus"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UAlert
          v-if="!mounts.length"
          color="amber"
          variant="soft"
          :title="t('storage.fs.wizard.create_vdisk.no_mount')"
        />
        <UFormGroup :label="t('storage.fs.wizard.create_vdisk.mount')">
          <div
            v-if="showMountSelect"
            class="grid grid-cols-1 sm:grid-cols-2 gap-2"
            role="radiogroup"
            :aria-label="t('storage.fs.wizard.create_vdisk.mount')"
          >
            <label
              v-for="m in eligibleMounts"
              :key="m.mountPoint"
              class="rounded-lg border px-3 py-3 cursor-pointer transition-colors"
              :class="mountPoint === m.mountPoint
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500'
                : 'border-gray-200 dark:border-gray-700'"
            >
              <input v-model="mountPoint" type="radio" class="sr-only" :value="m.mountPoint">
              <span class="block text-sm font-mono font-semibold">{{ m.mountPoint }}</span>
              <span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {{ t('storage.fs.active_filesystem.free', {
                  free: formatFsBytes(m.freeBytes),
                  total: formatFsBytes(m.totalBytes),
                }) }}
              </span>
            </label>
          </div>
          <p v-else-if="selectedMount" class="text-sm font-mono rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
            {{ selectedMount.mountPoint }}
            <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">
              {{ t('storage.fs.wizard.create_vdisk.free_hint', { free: formatFsBytes(selectedMount.freeBytes) }) }}
            </span>
          </p>
        </UFormGroup>
        <UFormGroup
          :label="t('storage.fs.wizard.create_vdisk.file_name')"
          :error="fileNameError ? t(fileNameError) : undefined"
        >
          <UInput v-model="fileName" placeholder="data01.img" class="font-mono" />
        </UFormGroup>
        <div class="flex gap-2">
          <UFormGroup class="flex-1" :label="t('storage.fs.wizard.create_vdisk.size')">
            <UInput v-model.number="sizeValue" type="number" min="1" />
          </UFormGroup>
          <UFormGroup class="w-28" :label="t('storage.fs.wizard.create_vdisk.size_unit')">
            <StorageNativeSelect v-model="sizeUnit" :options="sizeUnitOptions" />
          </UFormGroup>
        </div>
        <p v-if="selectedMount" class="text-xs text-gray-500 dark:text-gray-400">
          {{ t('storage.fs.wizard.create_vdisk.free_hint', { free: formatFsBytes(selectedMount.freeBytes) }) }}
        </p>
        <p v-if="sizeError" class="text-sm text-red-500 mt-1">{{ sizeError }}</p>
        <UFormGroup :label="t('storage.fs.wizard.create_vdisk.alloc')">
          <div class="flex flex-wrap gap-2" role="radiogroup">
            <label
              v-for="opt in allocOptions"
              :key="opt.value"
              class="flex-1 min-w-[8rem] rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors"
              :class="allocMode === opt.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500'
                : 'border-gray-200 dark:border-gray-700 hover:border-primary-300'"
            >
              <input v-model="allocMode" type="radio" class="sr-only" :value="opt.value">
              <span class="font-medium">{{ opt.label }}</span>
            </label>
          </div>
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
        </template>
      </template>

      <template v-else>
        <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('storage.fs.wizard.confirm_intro') }}</p>
        <p class="font-mono text-sm font-semibold text-primary-700 dark:text-primary-300 select-all">{{ preflight?.requiredConfirmation }}</p>
        <UFormGroup :label="t('storage.fs.wizard.create_fs.confirm_phrase')">
          <UInput v-model="confirmation" class="font-mono" :placeholder="preflight?.requiredConfirmation" />
        </UFormGroup>
        <ScstClusterNodeResults v-if="clusterNodeResults?.length" :node-results="clusterNodeResults" />
        <UAlert
          v-if="clusterNodeResults?.length"
          color="amber"
          variant="soft"
          :title="t('storage.fs.cluster.partial_title')"
          :description="t('storage.fs.cluster.partial_body')"
          class="mt-2"
        />
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
            {{ t('storage.fs.wizard.create_vdisk.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import ScstClusterNodeResults from '~/components/targets/ScstClusterNodeResults.vue'
import type { FileSystemMount } from '~/types/filesystem'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import { pickActiveFileioMount } from '~/utils/fs-active-filesystem'
import { validateVdiskFileName, validateVdiskSize } from '~/utils/fs-preflight-validation'
import { parseFsWizardExecuteFailure } from '~/utils/fs-wizard-execute'
import { formatFsBytes, parseFsSizeToBytes, type FsSizeUnit } from '~/utils/fs-wizard-ui'
import { mountsEligibleForVdisk } from '~/utils/fs-wizard-filters'
import StorageNativeSelect from '~/components/storage/StorageNativeSelect.vue'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  mounts: FileSystemMount[]
  initialMountPoint?: string
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()
const toast = useAppToast()

const step = ref(1)
const mountPoint = ref('')
const fileName = ref('data01.img')
const sizeValue = ref(1)
const sizeUnit = ref<FsSizeUnit>('gib')
const allocMode = ref<'fallocate' | 'dd'>('fallocate')
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const preflightLoading = ref(false)
const busy = ref(false)
const executeError = ref<string | null>(null)
const clusterNodeResults = ref<ClusterLvmNodeResult[] | null>(null)

const sizeUnitOptions = [
  { label: 'GiB', value: 'gib' },
  { label: 'MiB', value: 'mib' },
]
const allocOptions = [
  { label: 'fallocate', value: 'fallocate' },
  { label: 'dd', value: 'dd' },
]

const eligibleMounts = computed(() => mountsEligibleForVdisk(props.mounts, fs.overview?.systemProtection))
const showMountSelect = computed(() => eligibleMounts.value.length > 1)
const selectedMount = computed(() => eligibleMounts.value.find(m => m.mountPoint === mountPoint.value))
const sizeBytes = computed(() => parseFsSizeToBytes(Number(sizeValue.value), sizeUnit.value))

const fileNameError = computed(() => validateVdiskFileName(fileName.value))

const sizeError = computed(() => {
  if (!selectedMount.value) return ''
  const key = validateVdiskSize(sizeBytes.value, selectedMount.value.freeBytes)
  return key ? (t(key) as string) : ''
})

const step1Valid = computed(() =>
  !!mountPoint.value
  && !!fileName.value.trim()
  && !fileNameError.value
  && sizeBytes.value >= 1024 * 1024
  && !sizeError.value,
)

const preflightBlockers = computed(() =>
  (preflight.value?.blockers ?? [])
    .map(b => (b.startsWith('storage.') ? t(b) : b))
    .join(' · ') || '',
)
const commandPreview = computed(() =>
  (preflight.value?.commands ?? []).join('\n') || '—',
)

const canExecute = computed(() =>
  preflight.value?.ok
  && confirmation.value.trim() === preflight.value.requiredConfirmation,
)

onMounted(() => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  const picked = pickActiveFileioMount(eligibleMounts.value, {
    preferredMountPoint: props.initialMountPoint,
    newlyCreatedMountPoint: props.initialMountPoint,
  })
  if (picked) mountPoint.value = picked.mountPoint
})

async function loadPreflight() {
  preflightLoading.value = true
  preflight.value = null
  try {
    preflight.value = await fs.preflight('create_vdisk', {
      mountPoint: mountPoint.value,
      fileName: fileName.value.trim(),
      sizeBytes: sizeBytes.value,
      allocMode: allocMode.value,
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
  clusterNodeResults.value = null
  try {
    const clusterExecution = props.isClustered && props.clusterId
      ? { clusterId: props.clusterId, primarySanId: props.sanId }
      : undefined
    await fs.createVdisk({
      mountPoint: mountPoint.value,
      fileName: fileName.value.trim(),
      sizeBytes: sizeBytes.value,
      allocMode: allocMode.value,
      confirmation: confirmation.value.trim(),
    }, clusterExecution)
    toast.success(t('storage.fs.wizard.create_vdisk.success'))
    emit('close')
  } catch (e: unknown) {
    const failure = parseFsWizardExecuteFailure(e, t('common.error') as string)
    executeError.value = failure.executeError
    clusterNodeResults.value = failure.clusterNodeResults
    if (failure.isPartialCluster) {
      toast.error(t('storage.fs.cluster.partial_title') as string, failure.executeError)
    }
  } finally {
    busy.value = false
  }
}
</script>
