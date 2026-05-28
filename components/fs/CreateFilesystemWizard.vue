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
        <UAlert
          v-if="initialBackendBlocked"
          color="red"
          variant="soft"
          :title="t('storage.fs.wizard.create_fs.backend_blocked_title')"
          :description="initialBackendBlockedDescription"
        />

        <template v-if="selectedBackend && !initialBackendBlocked">
          <div
            v-if="!showBackendSelect"
            class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-4 space-y-3"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('storage.fs.wizard.create_fs.backend_summary_title') }}
            </p>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{{ t('storage.fs.wizard.create_fs.backend_path') }}</dt>
                <dd class="font-mono font-medium">{{ selectedBackend.path }}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{{ t('storage.fs.wizard.create_fs.backend_source') }}</dt>
                <dd>{{ backendSourceLine }}</dd>
              </div>
              <div v-if="backendRaidLevel">
                <dt class="text-gray-500 dark:text-gray-400">{{ t('storage.fs.wizard.create_fs.backend_raid') }}</dt>
                <dd>{{ backendRaidLevel }}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{{ t('storage.fs.wizard.create_fs.backend_size') }}</dt>
                <dd>{{ backendSizeLabel }}</dd>
              </div>
              <div>
                <dt class="text-gray-500 dark:text-gray-400">{{ t('storage.fs.wizard.create_fs.backend_status') }}</dt>
                <dd>
                  <UBadge
                    size="xs"
                    variant="soft"
                    :color="selectedBackendStatus === 'available' ? 'green' : selectedBackendStatus === 'wipe_required' ? 'amber' : 'gray'"
                    :label="t(`storage.fs.wizard.create_fs.status.${selectedBackendStatus}`)"
                  />
                </dd>
              </div>
            </dl>
          </div>

          <UFormGroup
            v-else
            :label="t('storage.fs.wizard.create_fs.backend')"
          >
            <StorageNativeSelect
              v-model="backendPath"
              :options="backendOptions"
              :disabled="!backendOptions.length"
            />
          </UFormGroup>

          <div
            v-if="signatureSummary.signatures.length || signatureSummary.reasonKeys.length"
            class="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-2"
          >
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
              {{ t('storage.fs.wizard.create_fs.signatures_title') }}
            </p>
            <p class="text-xs text-amber-800 dark:text-amber-200">
              {{ t('storage.fs.wizard.create_fs.signatures_device', { device: signatureSummary.devicePath }) }}
            </p>
            <ul v-if="signatureSummary.signatures.length" class="text-xs font-mono list-disc pl-5 space-y-0.5 text-amber-900 dark:text-amber-100">
              <li v-for="(sig, i) in signatureSummary.signatures" :key="`sig-${i}`">{{ sig }}</li>
            </ul>
            <ul class="text-xs list-disc pl-5 space-y-0.5 text-amber-800 dark:text-amber-200">
              <li v-for="(reason, i) in signatureReasonLabels" :key="`reason-${i}`">{{ reason }}</li>
            </ul>
            <p class="text-xs text-amber-800 dark:text-amber-200">
              {{ t('storage.fs.wizard.create_fs.signatures_wipe_hint') }}
            </p>
          </div>
        </template>

        <template v-if="step1FieldsEnabled">
          <UFormGroup :label="t('storage.fs.wizard.create_fs.fs_type')">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" :aria-label="t('storage.fs.wizard.create_fs.fs_type')">
              <label
                v-for="opt in fsTypeOptions"
                :key="opt.value"
                class="rounded-lg border px-3 py-3 cursor-pointer transition-colors"
                :class="fsType === opt.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500'
                  : 'border-gray-200 dark:border-gray-700'"
              >
                <input v-model="fsType" type="radio" class="sr-only" :value="opt.value">
                <span class="block text-sm font-semibold">{{ opt.label }}</span>
                <span v-if="opt.hint" class="block text-xs text-gray-500 dark:text-gray-400 mt-1">{{ opt.hint }}</span>
              </label>
            </div>
          </UFormGroup>

          <UFormGroup
            :label="t('storage.fs.wizard.create_fs.label')"
            :help="t('storage.fs.wizard.create_fs.label_help')"
            :error="labelError ? t(labelError) : undefined"
          >
            <UInput v-model="label" class="font-mono" />
          </UFormGroup>

          <UFormGroup
            :label="t('storage.fs.wizard.create_fs.mount_point')"
            :help="t('storage.fs.wizard.create_fs.mount_point_help')"
            :error="mountError ? t(mountError) : undefined"
          >
            <UInput
              v-model="mountPoint"
              class="font-mono"
              placeholder="/mnt/vdisks/fs01"
              @input="onMountPointInput"
            />
          </UFormGroup>

          <UFormGroup :label="t('storage.fs.wizard.create_fs.disk_layout')">
            <div class="space-y-2" role="radiogroup" :aria-label="t('storage.fs.wizard.create_fs.disk_layout')">
              <label
                v-for="opt in partitionOptions"
                :key="opt.value"
                class="flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors"
                :class="partitionStrategy === opt.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10 ring-1 ring-primary-500'
                  : 'border-gray-200 dark:border-gray-700'"
              >
                <input v-model="partitionStrategy" type="radio" class="mt-1 accent-primary-500" :value="opt.value">
                <span class="min-w-0">
                  <span class="block text-sm font-semibold">{{ opt.title }}</span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ opt.description }}</span>
                </span>
              </label>
            </div>
          </UFormGroup>
        </template>
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
          <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('storage.fs.wizard.create_fs.preflight_intro') }}</p>
          <div
            v-if="needsWipe"
            class="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100 space-y-1"
          >
            <p class="font-semibold">{{ t('storage.fs.wizard.create_fs.wipe_required_title') }}</p>
            <p>{{ t('storage.fs.wizard.create_fs.signatures_device', { device: signatureSummary.devicePath }) }}</p>
            <ul v-if="signatureSummary.signatures.length" class="font-mono list-disc pl-5">
              <li v-for="(sig, i) in signatureSummary.signatures" :key="`pf-sig-${i}`">{{ sig }}</li>
            </ul>
          </div>
          <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('storage.fs.wizard.command_preview') }}</p>
          <pre class="text-xs font-mono whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">{{ commandPreview }}</pre>
          <UAlert
            v-for="(w, i) in preflightWarningLabels"
            :key="i"
            color="amber"
            variant="soft"
            :description="w"
          />
        </template>
      </template>

      <template v-else>
        <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('storage.fs.wizard.create_fs.final_intro') }}</p>

        <div
          v-if="needsEmptyMountConfirm"
          class="rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-3"
        >
          <p class="text-sm font-semibold text-amber-900 dark:text-amber-100">
            {{ t('storage.fs.wizard.create_fs.empty_mount_final_title') }}
          </p>
          <p class="text-xs text-amber-800 dark:text-amber-200 font-mono">{{ mountPoint }}</p>
          <p class="text-xs text-amber-800 dark:text-amber-200">{{ t('storage.fs.wizard.create_fs.empty_mount_final_body') }}</p>
          <UCheckbox
            v-model="confirmEmptyMountDir"
            :label="t('storage.fs.wizard.create_fs.confirm_empty_mount')"
          />
        </div>

        <div
          v-if="needsWipe"
          class="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/20 p-3 space-y-3"
        >
          <p class="text-sm font-semibold text-red-800 dark:text-red-200">
            {{ t('storage.fs.wizard.create_fs.wipe_final_title') }}
          </p>
          <p class="text-xs text-red-700 dark:text-red-300">
            {{ t('storage.fs.wizard.create_fs.signatures_device', { device: signatureSummary.devicePath }) }}
          </p>
          <ul v-if="signatureSummary.signatures.length" class="text-xs font-mono list-disc pl-5 text-red-800 dark:text-red-200">
            <li v-for="(sig, i) in signatureSummary.signatures" :key="`fin-sig-${i}`">{{ sig }}</li>
          </ul>
          <p class="text-xs text-red-700 dark:text-red-300">{{ t('storage.fs.wizard.create_fs.wipe_final_body') }}</p>
          <UCheckbox
            v-model="confirmWipeSignatures"
            :label="t('storage.fs.wizard.create_fs.confirm_wipe')"
          />
        </div>

        <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('storage.fs.wizard.command_preview') }}</p>
        <pre class="text-xs font-mono whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 max-h-48 overflow-y-auto">{{ commandPreview }}</pre>

        <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('storage.fs.wizard.destructive_intro') }}</p>
        <p class="font-mono text-sm font-semibold text-red-700 dark:text-red-300 select-all">{{ preflight?.requiredConfirmation }}</p>
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
            {{ t('storage.fs.wizard.create_fs.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import ScstClusterNodeResults from '~/components/targets/ScstClusterNodeResults.vue'
import type { FsBackendRef, FsType, PartitionStrategy } from '~/types/filesystem'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import { validateMountPoint, validateFsLabel } from '~/utils/fs-preflight-validation'
import {
  buildFsSignatureSummary,
  formatFsBackendRaidLevel,
  formatFsBackendSize,
  formatFsBackendSourceLine,
  fsCreateWizardNeedsWipe,
  isFsBackendEsosProtected,
  shouldShowFsBackendSelect,
  syncMountPointFromLabel,
  translateFsBackendReason,
} from '~/utils/fs-create-wizard-ui'
import { parseFsWizardExecuteFailure } from '~/utils/fs-wizard-execute'
import { pickDefaultFsBackend } from '~/utils/fs-wizard-ui'
import { backendsEligibleForCreateFs, fsCreateWizardBackendStatus } from '~/utils/fs-wizard-filters'
import StorageNativeSelect from '~/components/storage/StorageNativeSelect.vue'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  candidates: FsBackendRef[]
  initialBackendPath?: string
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
const mountPointManuallyEdited = ref(false)
const lastSuggestedMount = ref('/mnt/vdisks/fs01')
const confirmWipeSignatures = ref(false)
const confirmEmptyMountDir = ref(false)
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const preflightLoading = ref(false)
const busy = ref(false)
const executeError = ref<string | null>(null)
const clusterNodeResults = ref<ClusterLvmNodeResult[] | null>(null)

const protection = computed(() => fs.overview?.systemProtection)

const eligibleBackends = computed(() =>
  backendsEligibleForCreateFs(props.candidates, protection.value),
)
const showBackendSelect = computed(() => shouldShowFsBackendSelect(eligibleBackends.value))
const backendOptions = computed(() =>
  eligibleBackends.value.map(c => ({
    label: c.displayName ? `${c.path} (${c.displayName})` : `${c.path} (${c.kind})`,
    value: c.path,
  })),
)
const selectedBackend = computed(() =>
  props.candidates.find(c => c.path === backendPath.value)
  ?? eligibleBackends.value.find(c => c.path === backendPath.value),
)
const selectedBackendRef = computed(() => selectedBackend.value as FsBackendRef | undefined)
const selectedBackendStatus = computed(() => fsCreateWizardBackendStatus(selectedBackend.value))
const needsWipe = computed(() => fsCreateWizardNeedsWipe(selectedBackend.value))
const needsEmptyMountConfirm = computed(() =>
  (preflight.value?.warnings ?? []).includes('storage.fs.wizard.create_fs.warn_mount_dir_empty'),
)

const initialBackendBlocked = computed(() => {
  const preferred = props.initialBackendPath?.trim()
  if (!preferred) return false
  if (eligibleBackends.value.some(c => c.path === preferred)) return false
  const cand = props.candidates.find(c => c.path === preferred)
  if (!cand) return false
  return true
})

const initialBackendBlockedDescription = computed(() => {
  const preferred = props.initialBackendPath?.trim()
  const cand = props.candidates.find(c => c.path === preferred)
  if (!cand) return t('storage.fs.wizard.create_fs.backend_not_found')
  if (isFsBackendEsosProtected(cand, protection.value)) {
    return t('storage.fs.wizard.create_fs.backend_esos_protected')
  }
  const reasons = cand.reasons.map(r => translateFsBackendReason(r, t))
  return reasons.length ? reasons.join(' · ') : t('storage.fs.wizard.create_fs.backend_ineligible')
})

const step1FieldsEnabled = computed(() =>
  !!selectedBackend.value
  && !initialBackendBlocked.value
  && selectedBackendStatus.value !== 'blocked',
)

const backendSourceLine = computed(() =>
  selectedBackendRef.value ? formatFsBackendSourceLine(selectedBackendRef.value) : '—',
)
const backendRaidLevel = computed(() =>
  selectedBackendRef.value ? formatFsBackendRaidLevel(selectedBackendRef.value) : null,
)
const backendSizeLabel = computed(() =>
  formatFsBackendSize(selectedBackendRef.value?.sizeBytes ?? 0),
)
const signatureSummary = computed(() =>
  selectedBackendRef.value
    ? buildFsSignatureSummary(selectedBackendRef.value)
    : { devicePath: backendPath.value || '—', signatures: [] as string[], reasonKeys: [] as string[] },
)
const signatureReasonLabels = computed(() =>
  signatureSummary.value.reasonKeys.map(key => translateFsBackendReason(key, t)),
)

const fsTypeOptions = computed(() => [
  {
    label: 'XFS',
    value: 'xfs' as const,
    hint: t('storage.fs.wizard.create_fs.fs_type_xfs_hint'),
  },
  {
    label: 'ext4',
    value: 'ext4' as const,
    hint: undefined,
  },
])
const partitionOptions = computed(() => [
  {
    value: 'none' as const,
    title: t('storage.fs.wizard.create_fs.layout_whole_title'),
    description: t('storage.fs.wizard.create_fs.layout_whole_desc'),
  },
  {
    value: 'gpt' as const,
    title: t('storage.fs.wizard.create_fs.layout_gpt_title'),
    description: t('storage.fs.wizard.create_fs.layout_gpt_desc'),
  },
])

const labelError = computed(() => validateFsLabel(label.value))
const mountError = computed(() => validateMountPoint(mountPoint.value))

const step1Valid = computed(() =>
  step1FieldsEnabled.value
  && !labelError.value
  && !mountError.value,
)

const preflightBlockers = computed(() => {
  const blockers = preflight.value?.blockers ?? []
  return blockers
    .map(b => (b.startsWith('storage.') ? t(b) : b))
    .join(' · ') || ''
})
const commandPreview = computed(() => {
  const lines = [
    ...(preflight.value?.configPreview ?? []),
    ...(preflight.value?.commands ?? []),
  ]
  return lines.join('\n') || '—'
})
const preflightWarningLabels = computed(() =>
  (preflight.value?.warnings ?? []).map(w => (w.startsWith('storage.') ? t(w) : w)),
)

const canExecute = computed(() =>
  preflight.value?.ok
  && confirmation.value.trim() === preflight.value.requiredConfirmation
  && (!needsWipe.value || confirmWipeSignatures.value)
  && (!needsEmptyMountConfirm.value || confirmEmptyMountDir.value),
)

watch(label, (l) => {
  const synced = syncMountPointFromLabel(l, mountPoint.value, lastSuggestedMount.value)
  if (synced) {
    mountPoint.value = synced.mountPoint
    lastSuggestedMount.value = synced.lastSuggestedMount
  }
})

watch(backendPath, () => {
  confirmWipeSignatures.value = false
})

function onMountPointInput() {
  mountPointManuallyEdited.value = mountPoint.value.trim() !== lastSuggestedMount.value.trim()
  if (!mountPointManuallyEdited.value) {
    lastSuggestedMount.value = mountPoint.value
  }
}

onMounted(() => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  const preferred = props.initialBackendPath?.trim() || ''
  if (preferred && eligibleBackends.value.some(c => c.path === preferred)) {
    backendPath.value = preferred
  } else if (preferred && props.candidates.some(c => c.path === preferred)) {
    backendPath.value = preferred
  } else {
    backendPath.value = pickDefaultFsBackend(eligibleBackends.value)
  }
  lastSuggestedMount.value = mountPoint.value
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
      allowWipeSignatures: true,
      allowUseEmptyMountDir: true,
    })
  } catch (e: unknown) {
    preflight.value = {
      ok: false,
      blockers: [(e as Error).message],
      commands: [],
      configPreview: [],
      warnings: [],
      requiredConfirmation: '',
    }
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
    confirmWipeSignatures.value = false
    confirmEmptyMountDir.value = false
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
    await fs.createFilesystem({
      backendPath: backendPath.value,
      fsType: fsType.value,
      label: label.value,
      mountPoint: mountPoint.value,
      partitionStrategy: partitionStrategy.value,
      allowWipeSignatures: needsWipe.value ? confirmWipeSignatures.value : false,
      allowUseEmptyMountDir: needsEmptyMountConfirm.value ? confirmEmptyMountDir.value : true,
      confirmation: confirmation.value.trim(),
    }, clusterExecution)
    toast.success(t('storage.fs.wizard.create_fs.success'))
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
