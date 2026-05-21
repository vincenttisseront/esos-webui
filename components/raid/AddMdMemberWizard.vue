<template>
  <div class="bg-white dark:bg-gray-900 rounded-xl shadow-modal w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
    <div class="px-5 pt-5 pb-0 shrink-0">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-plus-circle" class="w-5 h-5 text-primary-500" />
        <h3 class="font-semibold text-gray-900 dark:text-gray-100">
          {{ t('raid.add_member.wizard.title', { intent: intentLabel }) }}
        </h3>
      </div>
      <div class="flex gap-1 mt-3">
        <div
          v-for="(_, i) in steps"
          :key="i"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="i <= step ? 'bg-primary-500' : 'bg-gray-200 dark:bg-gray-700'"
        />
      </div>
    </div>

    <div class="px-5 py-4 min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4">
      <div v-if="step === 0" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ intentHelp }}</p>
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono font-semibold">{{ array.path }}</span>
            <UBadge :color="stateColor" :label="array.state" size="sm" variant="soft" />
            <UBadge color="gray" :label="`RAID ${array.raidLevel}`" size="sm" variant="outline" />
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('raid.software.cockpit.array.members', { active: array.activeDevices, total: array.raidDevices }) }}
          </p>
          <p v-if="array.failedDevices > 0" class="text-sm text-red-600">
            {{ t('raid.add_member.wizard.failed_members', { count: array.failedDevices }) }}
          </p>
        </div>
        <div
          v-if="array.progress"
          class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-sm text-amber-800"
        >
          {{ array.progress.action }} {{ array.progress.percent.toFixed(1) }}%
        </div>
      </div>

      <div v-else-if="step === 1" class="space-y-3">
        <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.add_member.wizard.partition_help') }}</p>
        <div v-if="!candidates.length" class="text-sm text-amber-600">
          {{ t('raid.add_member.wizard.no_candidates') }}
        </div>
        <div v-else class="space-y-1 max-h-72 overflow-y-auto">
          <label
            v-for="dev in candidates"
            :key="dev.path"
            class="flex items-start gap-3 px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            <input v-model="selectedDevice" type="radio" :value="dev.path" class="mt-1 accent-primary-500" />
            <div class="min-w-0 flex-1">
              <span class="font-mono text-sm">{{ dev.path }}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">{{ formatSize(dev.sizeBytes) }}</span>
              <p v-if="dev.partitionTypeName" class="text-xs text-gray-500 dark:text-gray-400">{{ dev.partitionTypeName }}</p>
            </div>
          </label>
        </div>
      </div>

      <div v-else-if="isClustered && step === 2" class="space-y-3">
        <UAlert
          :title="t('raid.add_member.wizard.cluster_title')"
          :description="t('raid.add_member.wizard.cluster_description')"
          color="amber"
          icon="i-heroicons-server-stack"
          variant="soft"
        />
        <ClusterStoragePreflightPanel
          v-if="clusterPreflightResult"
          :preflight="clusterPreflightResult"
          :on-navigate-detection="onNavigateDetection"
        />
        <p v-if="clusterPreflightError" class="text-sm text-red-600">{{ clusterPreflightError }}</p>
        <div v-if="ambiguousMappings.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{{ t('raid.add_member.wizard.mapping_manual') }}</p>
          <div
            v-for="mapping in ambiguousMappings"
            :key="mappingKey(mapping)"
            class="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-2"
          >
            <p class="text-sm font-mono">{{ mapping.sourcePath }} → {{ peerLabel(mapping.targetSanId) }}</p>
            <USelect
              :model-value="manualMappingSelection[mappingKey(mapping)] ?? ''"
              :options="mapping.candidates?.map(c => ({ label: c.path, value: c.path })) ?? []"
              @update:model-value="(v) => manualMappingSelection[mappingKey(mapping)] = String(v)"
            />
          </div>
          <UButton size="sm" color="primary" :loading="clusterPreflightLoading" @click="rerunClusterPreflight">
            {{ t('raid.add_member.wizard.rerun_cluster_preflight') }}
          </UButton>
        </div>
      </div>

      <div v-else-if="confirmStepIndex === step" class="space-y-4">
        <RaidPreflightPanel v-if="preflightResult" :preflight="preflightResult" :on-navigate-detection="onNavigateDetection" />
        <ClusterStoragePreflightPanel
          v-if="clusterPreflightResult && isClustered"
          :preflight="clusterPreflightResult"
          :on-navigate-detection="onNavigateDetection"
        />
        <div v-if="executionPlan?.nodeResults?.length" class="space-y-2">
          <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">{{ t('raid.add_member.wizard.per_node_commands') }}</p>
          <div
            v-for="node in executionPlan.nodeResults"
            :key="node.sanId"
            class="rounded border border-gray-200 bg-gray-50 dark:bg-gray-800 p-3"
          >
            <p class="text-sm font-semibold">{{ node.label }}</p>
            <pre class="text-xs font-mono mt-1 overflow-auto">{{ node.command }}</pre>
          </div>
        </div>
        <div v-else-if="preflightResult?.commandPreview" class="space-y-1">
          <pre class="text-xs font-mono bg-gray-50 dark:bg-gray-950 border rounded p-3">{{ preflightResult.commandPreview }}</pre>
        </div>
        <div class="space-y-2">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            {{ t('raid.add_member.wizard.confirm_hint') }}
            <code class="font-mono text-xs bg-amber-50 dark:bg-amber-950/40 border px-1 rounded">{{ confirmationPhrase }}</code>
          </p>
          <UInput v-model="confirmation" class="font-mono" @paste.prevent />
        </div>
        <label class="flex items-start gap-2 cursor-pointer">
          <input v-model="understood" type="checkbox" class="mt-0.5 accent-primary-500" />
          <span class="text-sm text-gray-600 dark:text-gray-400">{{ t('raid.add_member.wizard.understood') }}</span>
        </label>
        <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
      </div>

      <div v-else-if="step === doneStepIndex" class="space-y-3">
        <UAlert
          :title="t('raid.add_member.wizard.done_title')"
          :description="t('raid.add_member.wizard.done_description')"
          color="green"
          icon="i-heroicons-check-circle"
        />
        <div v-if="executionResults.length" class="space-y-2">
          <div
            v-for="node in executionResults"
            :key="node.sanId"
            class="flex justify-between items-center rounded border px-3 py-2 text-sm"
          >
            <span class="font-semibold">{{ node.label }}</span>
            <UBadge :color="node.status === 'success' ? 'green' : 'red'" :label="node.status" size="xs" />
          </div>
        </div>
      </div>
    </div>

    <div class="px-5 py-4 border-t flex justify-between shrink-0">
      <UButton color="gray" variant="ghost" :disabled="busy" @click="handleBackOrCancel">
        {{ step === 0 ? t('raid.add_member.wizard.cancel') : step === doneStepIndex ? t('raid.add_member.wizard.close') : t('raid.add_member.wizard.back') }}
      </UButton>
      <UButton
        v-if="step < confirmStepIndex"
        color="primary"
        :disabled="!canNext || busy"
        @click="handleNext"
      >
        {{ t('raid.add_member.wizard.next') }}
      </UButton>
      <UButton
        v-else-if="step === confirmStepIndex"
        color="green"
        :disabled="!canSubmit || busy"
        :loading="busy"
        icon="i-heroicons-bolt"
        @click="submit"
      >
        {{ t('raid.add_member.wizard.submit') }}
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  AddMdMemberExecutionPlan,
  AddMdMemberNodeResult,
  ClusterDiskMapping,
  ClusterStoragePreflightResult,
  MdAddMemberIntent,
  MdArray,
  RaidBlockDevice,
  RaidPreflightResult,
} from '~/types/raid'
import { filterEligibleAddMemberPartitions } from '~/utils/md-array-add-member-candidates'
import { filterPartitionMappingsForDevices } from '~/utils/raid-cluster-mapping'
import type { RaidDetectionNavigateFn } from '~/composables/useRaidDetectionNavigate'

const props = defineProps<{
  array: MdArray
  intent: MdAddMemberIntent
  blockDevices: RaidBlockDevice[]
  sourceSanId: string
  clusterId?: string | null
  onNavigateDetection?: RaidDetectionNavigateFn
}>()

const emit = defineEmits<{ done: []; cancel: [] }>()

const raid = useRaidStore()
const { t } = useEsosI18n()

const step = ref(0)
const busy = ref(false)
const selectedDevice = ref('')
const confirmation = ref('')
const understood = ref(false)
const submitError = ref<string | null>(null)
const preflightResult = ref<RaidPreflightResult | null>(null)
const clusterPreflightResult = ref<ClusterStoragePreflightResult | null>(null)
const clusterPreflightLoading = ref(false)
const clusterPreflightError = ref<string | null>(null)
const executionPlan = ref<AddMdMemberExecutionPlan | null>(null)
const executionResults = ref<AddMdMemberNodeResult[]>([])
const manualMappingSelection = reactive<Record<string, string>>({})
const lastDiskMappings = ref<import('~/types/raid').ClusterDiskMappingInput[]>([])

const isClustered = computed(() => Boolean(props.clusterId && props.sourceSanId))
const steps = computed(() => {
  const labels = [
    t('raid.add_member.wizard.step_intent'),
    t('raid.add_member.wizard.step_partition'),
  ]
  if (isClustered.value) labels.push(t('raid.add_member.wizard.step_mapping'))
  labels.push(t('raid.add_member.wizard.step_confirm'), t('raid.add_member.wizard.step_done'))
  return labels
})
const confirmStepIndex = computed(() => (isClustered.value ? 3 : 2))
const doneStepIndex = computed(() => confirmStepIndex.value + 1)

const candidates = computed(() =>
  filterEligibleAddMemberPartitions([props.array], props.blockDevices),
)

const intentLabel = computed(() =>
  props.intent === 'spare'
    ? t('raid.software.cockpit.array.add_member.spare')
    : t('raid.software.cockpit.array.add_member.replacement'),
)

const intentHelp = computed(() =>
  props.intent === 'spare'
    ? t('raid.add_member.wizard.help_spare')
    : t('raid.add_member.wizard.help_replacement'),
)

const preparedMappingHint = computed(() =>
  props.sourceSanId ? raid.getPreparedClusterMappings(props.sourceSanId, props.clusterId) : null,
)

const suggestedPartitionMappings = computed(() =>
  selectedDevice.value
    ? filterPartitionMappingsForDevices(preparedMappingHint.value, [selectedDevice.value])
    : [],
)

const ambiguousMappings = computed(() =>
  (clusterPreflightResult.value?.mappings ?? []).filter(m =>
    m.confidence === 'none' && (m.candidates?.length ?? 0) > 0,
  ),
)

const manualMappingInputs = computed(() =>
  ambiguousMappings.value
    .map(m => ({
      sourcePath: m.sourcePath,
      targetSanId: m.targetSanId,
      targetPath: manualMappingSelection[mappingKey(m)] ?? '',
      confirmedBy: 'operator' as const,
      sourceKind: 'partition' as const,
    }))
    .filter(m => m.targetPath),
)

const confirmationPhrase = computed(() =>
  executionPlan.value?.confirmationPhrase
  ?? preflightResult.value?.requiredConfirmation
  ?? '',
)

const stateColor = computed(() => {
  const s = props.array.state
  if (s === 'active' || s === 'clean') return 'green'
  if (s === 'degraded' || s === 'failed') return 'red'
  return 'gray'
})

const canNext = computed(() => {
  if (step.value === 1) return Boolean(selectedDevice.value)
  if (isClustered.value && step.value === 2) return clusterPreflightResult.value?.ok === true
  return true
})

const canSubmit = computed(() =>
  understood.value
  && preflightResult.value?.ok
  && (!isClustered.value || (clusterPreflightResult.value?.ok && executionPlan.value))
  && confirmation.value === confirmationPhrase.value,
)

function mappingKey(m: ClusterDiskMapping) {
  return `${m.sourcePath}:${m.targetSanId}`
}

function peerLabel(sanId: string) {
  return clusterPreflightResult.value?.nodes.find(n => n.sanId === sanId)?.label ?? sanId
}

function formatSize(bytes?: number) {
  if (!bytes) return '—'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

async function runLocalPreflight() {
  preflightResult.value = await raid.preflight({
    backend: 'software_md',
    action: 'md_add_device',
    payload: {
      name: props.array.name,
      device: selectedDevice.value,
      intent: props.intent,
    },
  })
}

async function runClusterPreflight() {
  if (!isClustered.value) return
  clusterPreflightLoading.value = true
  clusterPreflightError.value = null
  try {
    const diskMappings = [...suggestedPartitionMappings.value, ...manualMappingInputs.value]
    lastDiskMappings.value = diskMappings
    clusterPreflightResult.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId ?? undefined,
      primarySanId: props.sourceSanId,
      action: 'md_add_device',
      payload: {
        name: props.array.name,
        device: selectedDevice.value,
        intent: props.intent,
      },
      diskMappings,
    })
    if (clusterPreflightResult.value.ok) {
      executionPlan.value = await raid.planAddMdMember(props.array.name, {
        device: selectedDevice.value,
        intent: props.intent,
        clusterExecution: {
          clusterId: props.clusterId ?? undefined,
          primarySanId: props.sourceSanId,
          diskMappings,
          requirePreflightOk: true,
        },
      })
    } else {
      executionPlan.value = null
    }
  } catch (err: any) {
    clusterPreflightError.value = err?.data?.statusMessage ?? err.message ?? 'Préflight cluster indisponible'
    executionPlan.value = null
  } finally {
    clusterPreflightLoading.value = false
  }
}

async function rerunClusterPreflight() {
  await runClusterPreflight()
}

async function handleNext() {
  if (step.value === 1 && isClustered.value) {
    await runClusterPreflight()
  }
  if (step.value + 1 === confirmStepIndex.value) {
    await runLocalPreflight()
    if (isClustered.value && !executionPlan.value) {
      await runClusterPreflight()
    }
  }
  step.value += 1
}

function handleBackOrCancel() {
  if (step.value === 0 || step.value === doneStepIndex.value) {
    emit(step.value === doneStepIndex.value ? 'done' : 'cancel')
    return
  }
  step.value -= 1
}

async function submit() {
  busy.value = true
  submitError.value = null
  try {
    const result = await raid.addMdMember(props.array.name, {
      device: selectedDevice.value,
      intent: props.intent,
      confirmation: confirmation.value,
      clusterExecution: isClustered.value
        ? {
            clusterId: props.clusterId ?? undefined,
            primarySanId: props.sourceSanId,
            diskMappings: lastDiskMappings.value,
            requirePreflightOk: true,
            planToken: executionPlan.value?.planToken,
          }
        : undefined,
    })
    executionResults.value = result.nodeResults
    step.value = doneStepIndex.value
  } catch (err: any) {
    submitError.value = err?.data?.statusMessage ?? err.message ?? 'Erreur lors de l\'ajout'
  } finally {
    busy.value = false
  }
}
</script>
