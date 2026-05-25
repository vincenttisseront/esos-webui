<template>
  <LvmWizardModalShell
    :title="t('storage.fs.wizard.fileio.title')"
    :step="step"
    :total-steps="3"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UAlert
          v-if="!vdiskOptions.length"
          color="amber"
          variant="soft"
          :title="t('storage.fs.wizard.fileio.no_vdisk')"
        />
        <UFormGroup :label="t('storage.fs.wizard.fileio.vdisk')">
          <USelect
            v-model="selectedPath"
            :options="vdiskOptions"
            :disabled="!vdiskOptions.length"
          />
        </UFormGroup>
        <UFormGroup :label="t('storage.fs.wizard.fileio.device_name')">
          <UInput v-model="deviceName" />
          <p v-if="nameError" class="mt-1 text-xs text-red-600">{{ nameError }}</p>
        </UFormGroup>
        <UCheckbox v-model="nvCache" :label="t('storage.fs.wizard.fileio.nv_cache')" />
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
            {{ t('storage.fs.wizard.fileio.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import ScstClusterNodeResults from '~/components/targets/ScstClusterNodeResults.vue'
import type { VDiskFile } from '~/types/filesystem'
import type { ClusterLvmNodeResult } from '~/types/lvm'
import { suggestedScstDeviceName, validateScstDeviceName } from '~/utils/lvm-scst-device-ui'
import { parseFsWizardExecuteFailure } from '~/utils/fs-wizard-execute'

const props = defineProps<{
  sanId: string
  clusterId?: string
  isClustered?: boolean
  vdisks: VDiskFile[]
  initialVdiskPath?: string
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const fs = useFsStore()
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

const vdiskOptions = computed(() =>
  props.vdisks.map(v => ({ label: `${v.fileName} — ${v.path}`, value: v.path })),
)

const selectedVdisk = computed(() => props.vdisks.find(v => v.path === selectedPath.value))

const nameError = computed(() => {
  const err = validateScstDeviceName(deviceName.value)
  if (!err) return null
  return t(`storage.fs.wizard.fileio.error_name_${err}`)
})

const step1Valid = computed(() =>
  !!selectedPath.value
  && props.vdisks.some(v => v.path === selectedPath.value)
  && !nameError.value,
)

const preflightBlockers = computed(() => preflight.value?.blockers?.join(' · ') || '')
const configPreview = computed(() =>
  (preflight.value?.configPreview ?? []).join('\n') || '—',
)

const canExecute = computed(() =>
  preflight.value?.ok
  && confirmation.value.trim() === preflight.value.requiredConfirmation,
)

onMounted(() => {
  fs.setSanId(props.sanId)
  if (props.clusterId) fs.setClusterContext(props.clusterId, props.sanId)
  const preferred = props.initialVdiskPath
  if (preferred && props.vdisks.some(v => v.path === preferred)) {
    selectedPath.value = preferred
  } else if (vdiskOptions.value[0]) {
    selectedPath.value = vdiskOptions.value[0].value
  }
  syncDeviceName()
})

watch(selectedPath, syncDeviceName)

function syncDeviceName() {
  const v = selectedVdisk.value
  if (!v) return
  const base = v.fileName.replace(/\.img$/i, '').replace(/[^A-Za-z0-9_-]/g, '_')
  deviceName.value = suggestedScstDeviceName('vdisk', base)
}

async function loadPreflight() {
  if (!selectedVdisk.value) return
  preflightLoading.value = true
  preflight.value = null
  try {
    preflight.value = await fs.preflight('bind_fileio', {
      deviceName: deviceName.value.trim(),
      vdiskPath: selectedVdisk.value.path,
      nvCache: nvCache.value,
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
  if (!canExecute.value || !selectedVdisk.value) return
  busy.value = true
  executeError.value = null
  clusterNodeResults.value = null
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
    toast.success(t('storage.fs.wizard.fileio.success'))
    emit('close')
    const next = res.nextAction ?? { route: '/targets', query: { exposeDevice: res.deviceName } }
    if (next.route) {
      await router.push({ path: next.route, query: next.query })
    }
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
