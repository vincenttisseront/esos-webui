<template>
  <LvmWizardModalShell
    :title="t('storage.fs.wizard.fileio.title')"
    :step="step"
    :total-steps="wizardTotalSteps"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1 && !hasEligibleVdisks">
        <UAlert
          color="amber"
          variant="soft"
          :title="emptyStateTitle"
          :description="emptyStateDescription"
        />
        <div v-if="registeredDeviceRows.length" class="space-y-2">
          <ul class="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            <li
              v-for="row in registeredDeviceRows"
              :key="row.device.name"
              class="px-3 py-2 text-xs space-y-1"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono font-semibold text-primary-700 dark:text-primary-300">{{ row.device.name }}</span>
                <UBadge
                  size="xs"
                  :color="row.device.mapped ? 'green' : 'gray'"
                  variant="soft"
                  :label="row.device.mapped
                    ? t('storage.fs.table.mapped')
                    : t('storage.fs.table.unmapped')"
                />
              </div>
              <p class="font-mono break-all text-gray-600 dark:text-gray-400">{{ row.device.filename }}</p>
              <div v-if="row.viewMappingsUrl || row.exposeLunUrl" class="flex flex-wrap gap-2 pt-1">
                <NuxtLink
                  v-if="row.viewMappingsUrl"
                  :to="row.viewMappingsUrl"
                  class="text-primary-600 hover:underline"
                >
                  {{ t('storage.fs.wizard.fileio.actions.view_mappings') }}
                </NuxtLink>
                <NuxtLink
                  v-if="row.exposeLunUrl"
                  :to="row.exposeLunUrl"
                  class="text-primary-600 hover:underline"
                >
                  {{ t('storage.fs.wizard.fileio.actions.map_lun') }}
                </NuxtLink>
              </div>
            </li>
          </ul>
        </div>
      </template>

      <template v-else-if="step === 1">
        <UAlert
          v-if="existingRegistration"
          color="blue"
          variant="soft"
          :title="t('storage.fs.wizard.fileio.conflict.vdisk_file_already_fileio', {
            existingDeviceName: existingRegistration.deviceName,
          })"
        >
          <template #description>
            <p class="text-xs mt-1 font-mono break-all">{{ existingRegistration.filename }}</p>
            <p class="text-xs mt-2">
              {{ t('storage.fs.wizard.fileio.status.registered', { deviceName: existingRegistration.deviceName }) }}
              <UBadge
                class="ml-1"
                size="xs"
                :color="existingRegistration.mapped ? 'green' : 'gray'"
                variant="soft"
                :label="existingRegistration.mapped
                  ? t('storage.fs.table.mapped')
                  : t('storage.fs.table.unmapped')"
              />
            </p>
            <div v-if="registrationActions.viewMappingsUrl || registrationActions.exposeLunUrl" class="flex flex-wrap gap-2 mt-3">
              <NuxtLink
                v-if="registrationActions.viewMappingsUrl"
                :to="registrationActions.viewMappingsUrl"
                class="text-xs text-primary-600 hover:underline"
              >
                {{ t('storage.fs.wizard.fileio.actions.view_mappings') }}
              </NuxtLink>
              <NuxtLink
                v-if="registrationActions.exposeLunUrl"
                :to="registrationActions.exposeLunUrl"
                class="text-xs text-primary-600 hover:underline"
              >
                {{ t('storage.fs.wizard.fileio.actions.map_lun') }}
              </NuxtLink>
            </div>
          </template>
        </UAlert>
        <UFormGroup :label="t('storage.fs.wizard.fileio.vdisk')">
          <USelect
            v-model="selectedPath"
            :options="vdiskOptions"
          />
        </UFormGroup>
        <UFormGroup :label="t('storage.fs.wizard.fileio.device_name')">
          <UInput v-model="deviceName" :disabled="!!existingRegistration" />
          <p v-if="showNameError" class="mt-1 text-xs text-red-600">{{ nameError }}</p>
        </UFormGroup>
        <UCheckbox v-model="nvCache" :label="t('storage.fs.wizard.fileio.nv_cache')" :disabled="!!existingRegistration" />
      </template>

      <template v-else-if="step === 2">
        <UAlert v-if="preflightLoading" color="gray" variant="soft" :title="t('storage.fs.wizard.preflight_loading')" />
        <div v-else-if="conflictDisplay" class="space-y-2">
          <UAlert
            color="amber"
            variant="soft"
            :title="t('storage.fs.wizard.preflight_blockers')"
            :description="conflictDisplay"
          />
          <div v-if="conflictActionLinks.viewMappingsUrl || conflictActionLinks.exposeLunUrl" class="flex flex-wrap gap-3 px-1">
            <NuxtLink
              v-if="conflictActionLinks.viewMappingsUrl"
              :to="conflictActionLinks.viewMappingsUrl"
              class="text-xs text-primary-600 hover:underline"
            >
              {{ t('storage.fs.wizard.fileio.actions.view_mappings') }}
            </NuxtLink>
            <NuxtLink
              v-if="conflictActionLinks.exposeLunUrl"
              :to="conflictActionLinks.exposeLunUrl"
              class="text-xs text-primary-600 hover:underline"
            >
              {{ t('storage.fs.wizard.fileio.actions.map_lun') }}
            </NuxtLink>
          </div>
          <p v-if="fileioConflictAllowsNameRetry(conflict)" class="text-xs text-gray-600 dark:text-gray-400 px-1">
            {{ t('storage.fs.wizard.fileio.conflict.hint_rename_device') }}
          </p>
        </div>
        <UAlert
          v-else-if="preflightBlockers"
          color="red"
          variant="soft"
          :title="t('storage.fs.wizard.preflight_blockers')"
          :description="preflightBlockers"
        />
        <template v-else-if="preflight">
          <p class="text-xs text-gray-600 dark:text-gray-400">{{ t('storage.fs.wizard.config_preview') }}</p>
          <pre class="text-xs font-mono whitespace-pre-wrap rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">{{ configPreview }}</pre>
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
        <UAlert
          v-if="executeError"
          color="red"
          variant="soft"
          :title="t('storage.fs.wizard.preflight_blockers')"
          :description="executeError"
        />
      </template>
    </div>

    <template #footer>
      <div class="flex justify-between gap-2">
        <UButton v-if="step > 1" color="gray" variant="ghost" @click="step--">{{ t('storage.fs.wizard.back') }}</UButton>
        <span v-else />
        <div class="flex gap-2">
          <template v-if="!hasEligibleVdisks">
            <UButton color="gray" variant="ghost" @click="emit('cancel')">
              {{ t('storage.fs.wizard.fileio.actions.close') }}
            </UButton>
            <UButton
              v-if="onCreateVdisk"
              color="primary"
              icon="i-heroicons-document-plus"
              @click="handleCreateVdisk"
            >
              {{ t('storage.fs.wizard.fileio.actions.create_vdisk') }}
            </UButton>
          </template>
          <template v-else>
            <UButton color="gray" variant="ghost" @click="emit('cancel')">{{ t('storage.fs.wizard.cancel') }}</UButton>
            <UButton
              v-if="step < 3 && !registerBlocked"
              color="primary"
              :disabled="(step === 1 && !step1Valid) || (step === 2 && !preflight?.ok)"
              :loading="preflightLoading"
              @click="onNext"
            >
              {{ t('storage.fs.wizard.next') }}
            </UButton>
            <UButton
              v-else-if="step >= 3 && !registerBlocked"
              color="primary"
              :loading="busy"
              :disabled="!canExecute"
              @click="execute"
            >
              {{ t('storage.fs.wizard.fileio.execute') }}
            </UButton>
          </template>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import ScstClusterNodeResults from '~/components/targets/ScstClusterNodeResults.vue'
import type { FileioBindConflict, VDiskFile } from '~/types/filesystem'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import { suggestedScstDeviceName, validateScstDeviceName } from '~/utils/lvm-scst-device-ui'
import {
  fileioConflictActions,
  fileioConflictAllowsNameRetry,
  fileioConflictBlocksCreate,
  findFileioRegistrationForPath,
  formatFileioBindConflictMessage,
  parseFileioBindConflictFromError,
} from '~/utils/fs-fileio-bind-conflict'
import { parseFsWizardExecuteFailure } from '~/utils/fs-wizard-execute'
import { eligibleVdisksForFileioBind } from '~/utils/fs-fileio-eligible-vdisks'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  vdisks: VDiskFile[]
  initialVdiskPath?: string
  onCreateVdisk?: () => void | Promise<void>
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()
const { overview } = useOverview()
const toast = useAppToast()
const router = useRouter()

const step = ref(1)
const selectedPath = ref('')
const deviceName = ref('')
const nvCache = ref(true)
const confirmation = ref('')
const preflight = ref<Awaited<ReturnType<typeof fs.preflight>> | null>(null)
const preflightLoading = ref(false)
const busy = ref(false)
const executeError = ref<string | null>(null)
const clusterNodeResults = ref<ClusterLvmNodeResult[] | null>(null)
const conflict = ref<FileioBindConflict | null>(null)

const eligibleVdisks = computed(() =>
  eligibleVdisksForFileioBind(props.vdisks, fs.overview),
)

const hasEligibleVdisks = computed(() => eligibleVdisks.value.length > 0)

const wizardTotalSteps = computed(() => (hasEligibleVdisks.value ? 3 : 1))

const registeredFileioDevices = computed(() => fs.overview?.fileioDevices ?? [])

const emptyStateTitle = computed(() =>
  registeredFileioDevices.value.length > 0
    ? t('storage.fs.wizard.fileio.all_registered.title')
    : t('storage.fs.wizard.fileio.empty.title'),
)

const emptyStateDescription = computed(() =>
  registeredFileioDevices.value.length > 0
    ? t('storage.fs.wizard.fileio.all_registered.description')
    : t('storage.fs.wizard.fileio.empty.description'),
)

const registeredDeviceRows = computed(() =>
  registeredFileioDevices.value.map(device => {
    const actions = fileioConflictActions(
      {
        code: 'vdisk_file_already_fileio',
        message: '',
        existingDeviceName: device.name,
        mapped: device.mapped,
      },
      overview.value,
    )
    return {
      device,
      viewMappingsUrl: actions.viewMappingsUrl,
      exposeLunUrl: actions.exposeLunUrl,
    }
  }),
)

const vdiskOptions = computed(() =>
  eligibleVdisks.value.map(v => ({ label: `${v.fileName} — ${v.path}`, value: v.path })),
)

const selectedVdisk = computed(() => eligibleVdisks.value.find(v => v.path === selectedPath.value))

const existingRegistration = computed(() =>
  findFileioRegistrationForPath(fs.overview, selectedPath.value),
)

const registrationActions = computed(() => {
  const name = existingRegistration.value?.deviceName
  if (!name) return { viewMappingsUrl: null, exposeLunUrl: null }
  return fileioConflictActions(
    name
      ? { code: 'vdisk_file_already_fileio', message: '', existingDeviceName: name, mapped: existingRegistration.value?.mapped }
      : null,
    overview.value,
  )
})

const nameError = computed(() => {
  if (!hasEligibleVdisks.value) return null
  const err = validateScstDeviceName(deviceName.value)
  if (!err) return null
  return t(`storage.fs.wizard.fileio.error_name_${err}`)
})

const showNameError = computed(() => !!nameError.value && hasEligibleVdisks.value)

const step1Valid = computed(() =>
  hasEligibleVdisks.value
  && !!selectedPath.value
  && eligibleVdisks.value.some(v => v.path === selectedPath.value)
  && !nameError.value
  && !existingRegistration.value,
)

const registerBlocked = computed(() =>
  !!existingRegistration.value || fileioConflictBlocksCreate(conflict.value),
)

const preflightBlockers = computed(() => {
  if (conflict.value) return ''
  return preflight.value?.blockers?.join(' · ') || ''
})

const conflictDisplay = computed(() =>
  conflict.value ? formatFileioBindConflictMessage(conflict.value, t) : '',
)

const conflictActionLinks = computed(() => fileioConflictActions(conflict.value, overview.value))

const configPreview = computed(() =>
  (preflight.value?.configPreview ?? []).join('\n') || '—',
)

const canExecute = computed(() =>
  preflight.value?.ok
  && confirmation.value.trim() === preflight.value.requiredConfirmation,
)

function handleCreateVdisk() {
  emit('close')
  void props.onCreateVdisk?.()
}

onMounted(() => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  if (!hasEligibleVdisks.value) return
  const preferred = props.initialVdiskPath
  if (preferred && eligibleVdisks.value.some(v => v.path === preferred)) {
    selectedPath.value = preferred
  } else if (vdiskOptions.value[0]) {
    selectedPath.value = vdiskOptions.value[0].value
  }
  syncDeviceName()
})

watch(selectedPath, () => {
  syncDeviceName()
  conflict.value = null
})

watch(deviceName, () => {
  if (conflict.value?.code === 'device_name_exists') {
    conflict.value = null
  }
})

function syncDeviceName() {
  const v = selectedVdisk.value
  if (!v || existingRegistration.value) return
  const base = v.fileName.replace(/\.img$/i, '').replace(/[^A-Za-z0-9_-]/g, '_')
  deviceName.value = suggestedScstDeviceName('vdisk', base)
}

function applyPreflightError(e: unknown) {
  const parsed = parseFileioBindConflictFromError(e)
  if (parsed) {
    conflict.value = parsed
    preflight.value = {
      ok: false,
      blockers: [],
      commands: [],
      configPreview: [],
      warnings: [],
      conflict: parsed,
    }
    return
  }
  const msg = (e as { statusMessage?: string; message?: string }).statusMessage
    ?? (e as Error).message
    ?? t('common.error')
  preflight.value = { ok: false, blockers: [msg], commands: [], configPreview: [], warnings: [] }
}

async function loadPreflight() {
  if (!selectedVdisk.value || existingRegistration.value) return
  preflightLoading.value = true
  preflight.value = null
  conflict.value = null
  try {
    preflight.value = await fs.preflight('bind_fileio', {
      deviceName: deviceName.value.trim(),
      vdiskPath: selectedVdisk.value.path,
      nvCache: nvCache.value,
    })
    if (preflight.value.conflict) {
      conflict.value = preflight.value.conflict
    }
  } catch (e: unknown) {
    applyPreflightError(e)
  } finally {
    preflightLoading.value = false
  }
}

async function onNext() {
  if (!hasEligibleVdisks.value) return
  if (step.value === 1) {
    if (existingRegistration.value) return
    await loadPreflight()
    step.value = 2
    return
  }
  if (step.value === 2 && (conflict.value || !preflight.value?.ok)) return
  if (step.value === 2) {
    step.value = 3
    confirmation.value = ''
  }
}

async function execute() {
  if (!canExecute.value || !selectedVdisk.value || registerBlocked.value) return
  busy.value = true
  executeError.value = null
  clusterNodeResults.value = null
  conflict.value = null
  try {
    const clusterExecution = props.isClustered && props.clusterId
      ? { clusterId: props.clusterId, primarySanId: props.sanId }
      : undefined
    const res = await fs.bindFileio({
      deviceName: deviceName.value.trim(),
      vdiskPath: selectedVdisk.value.path,
      nvCache: nvCache.value,
      confirmation: confirmation.value.trim(),
    }, clusterExecution)
    await fs.fetchOverview(true)
    toast.success(t('storage.fs.wizard.fileio.success'))
    emit('close')
    const next = res.nextAction ?? { route: '/targets', query: { exposeDevice: res.deviceName } }
    if (next.route) {
      await router.push({ path: next.route, query: next.query })
    }
  } catch (e: unknown) {
    const failure = parseFsWizardExecuteFailure(e, t('common.error') as string, t)
    executeError.value = failure.executeError
    clusterNodeResults.value = failure.clusterNodeResults
    if (failure.conflict) conflict.value = failure.conflict
    if (failure.isPartialCluster) {
      toast.error(t('storage.fs.cluster.partial_title') as string, failure.executeError)
    } else {
      toast.error(failure.executeError)
    }
  } finally {
    busy.value = false
  }
}
</script>
