<template>
  <BaseModal
    :title="title"
    icon="i-heroicons-exclamation-triangle"
    :intent="riskLevel === 'destructive' ? 'danger' : 'warning'"
    size="lg"
    :closable="!executing"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-4 max-h-[70vh] overflow-y-auto">
      <RaidRiskBadge :risk="riskLevel" />
      <p class="text-sm text-gray-700 dark:text-gray-300">{{ description }}</p>

      <UAlert
        v-if="uuidConflict"
        :title="t('raid.cluster_md.recovery.uuid_conflict_title')"
        :description="uuidConflictDescription"
        color="red"
        icon="i-heroicons-exclamation-triangle"
        variant="soft"
      />
      <UAlert
        v-else-if="isDegradedMode"
        :title="degradedAlertTitle"
        :description="degradedAlertDescription"
        color="amber"
        icon="i-heroicons-exclamation-triangle"
        variant="soft"
      />
      <UAlert
        v-else
        :title="t('raid.cluster_md.all_nodes_title')"
        :description="t('raid.cluster_md.all_nodes_description')"
        color="amber"
        icon="i-heroicons-server-stack"
        variant="soft"
      />

      <ul
        v-if="isInconsistentStopMode"
        class="text-sm text-amber-800 dark:text-amber-200 list-disc pl-5 space-y-1 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-3"
      >
        <li>{{ t('raid.cluster_md.recovery.stop_inconsistent_risk_metadata') }}</li>
        <li>{{ t('raid.cluster_md.recovery.stop_inconsistent_risk_stop_only') }}</li>
        <li>{{ t('raid.cluster_md.recovery.stop_inconsistent_risk_followup') }}</li>
      </ul>

      <RaidPreflightPanel v-if="localPreflight" :preflight="localPreflight" />

      <motion.div
        v-if="clusterLoading"
        class="text-sm text-gray-500 flex items-center gap-2"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
      >
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
        {{ t('raid.cluster_md.preflight_loading') }}
      </motion.div>
      <ClusterStoragePreflightPanel
        v-else-if="clusterPreflight && !recoveryAssessment && !showMappingFork && !showLocalRecoveryMode"
        :preflight="clusterPreflight"
      />

      <motion.div
        v-if="recoveryAssessment?.nodeReports.length"
        class="space-y-2"
        :initial="{ opacity: 0, y: 6 }"
        :animate="{ opacity: 1, y: 0 }"
      >
        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          {{ t('raid.cluster_md.recovery.node_state_title') }}
        </p>
        <motion.div
          v-for="report in recoveryAssessment.nodeReports"
          :key="report.sanId"
          class="flex flex-wrap items-center gap-2 text-sm border border-gray-200 dark:border-gray-700 rounded px-3 py-2"
          :initial="{ opacity: 0, x: -4 }"
          :animate="{ opacity: 1, x: 0 }"
        >
          <span class="font-medium">{{ report.label }}</span>
          <UBadge
            :label="t(`raid.cluster_md.recovery.node_state.${report.state}`)"
            size="xs"
            variant="soft"
          />
          <span v-if="report.uuid" class="text-xs font-mono text-gray-500">{{ t('raid.cluster_md.recovery.col_uuid') }}: {{ report.uuid }}</span>
          <span v-if="report.arrayPath" class="text-xs font-mono text-gray-500">{{ report.arrayPath }}</span>
          <span v-if="report.reasons[0]" class="text-xs text-gray-500">{{ report.reasons[0] }}</span>
        </motion.div>
      </motion.div>

      <motion.div
        v-if="recoveryModeOptions.length > 1"
        class="space-y-2"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
      >
        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          {{ t('raid.cluster_md.recovery.mode_title') }}
        </p>
        <USelect
          v-model="selectedRecoveryMode"
          :options="recoveryModeOptions"
          value-attribute="value"
          option-attribute="label"
          size="sm"
        />
      </motion.div>

      <ClusterMdExecutionPlanTable
        v-if="executionPlan?.nodeResults.length"
        :title="t('raid.cluster_md.execution_plan_title')"
        :node-results="executionPlan.nodeResults"
        show-recovery-columns
      />

      <ClusterMdExecutionPlanTable
        v-if="executionResult?.nodeResults.length"
        :title="t('raid.cluster_md.execution_results_title')"
        :node-results="executionResult.nodeResults"
        show-output
        show-recovery-columns
      />

      <motion.div
        v-if="showMappingFork && !showLocalRecoveryMode && !showMappingResolver"
        class="space-y-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 p-4"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
      >
        <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {{ t('raid.cluster_md.local_recovery.mapping_blocked_title') }}
        </p>
        <p class="text-xs text-amber-800 dark:text-amber-300">
          {{ t('raid.cluster_md.local_recovery.mapping_blocked_description') }}
        </p>
        <motion.div class="flex flex-wrap gap-2">
          <UButton size="sm" color="amber" variant="soft" @click="showMappingResolver = true">
            {{ t('raid.cluster_md.local_recovery.resolve_mapping') }}
          </UButton>
          <UButton size="sm" color="red" variant="solid" @click="enterLocalRecoveryMode">
            {{ t('raid.cluster_md.local_recovery.run_local_only') }}
          </UButton>
        </motion.div>
      </motion.div>

      <motion.div
        v-if="showMappingResolver && ambiguousMappings.length"
        class="space-y-3"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
      >
        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          {{ t('raid.cluster_md.local_recovery.resolve_mapping_title') }}
        </p>
        <motion.div
          v-for="mapping in ambiguousMappings"
          :key="mappingKey(mapping)"
          class="rounded border border-amber-200 dark:border-amber-800 p-3 space-y-2 text-sm"
        >
          <p class="font-mono text-xs">{{ mapping.sourcePath }} → {{ nodeLabel(mapping.targetSanId) }}</p>
          <select
            v-model="manualMappingSelection[mappingKey(mapping)]"
            class="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-sm"
          >
            <option value="">{{ t('raid.create_md.mapping.select_placeholder') }}</option>
            <option v-for="c in mapping.candidates" :key="c.path" :value="c.path">{{ c.path }}</option>
          </select>
        </motion.div>
        <motion.div class="flex gap-2">
          <UButton size="sm" color="gray" variant="outline" @click="showMappingResolver = false">
            {{ t('common.actions.cancel') }}
          </UButton>
          <UButton size="sm" color="amber" :disabled="!manualMappingComplete" @click="retryClusterCleanupAfterMapping">
            {{ t('raid.cluster_md.local_recovery.retry_cluster_plan') }}
          </UButton>
        </motion.div>
      </motion.div>

      <ClusterLocalRecoveryPanel
        v-if="showLocalRecoveryMode && localRecoveryOffered"
        v-model:input-phrase="localRecoveryPhrase"
        :offered="localRecoveryOffered"
        :members="cleanupMembers"
        :confirmation-phrase="localRecoveryConfirmationPhrase"
        :disabled="executing"
      />

      <UAlert
        v-if="planError && !showMappingFork"
        :title="t('raid.cluster_md.plan_error_title')"
        :description="planError"
        color="red"
        icon="i-heroicons-x-circle"
      />

      <div v-if="effectiveConfirmationPhrase && !showLocalRecoveryMode" class="space-y-2">
        <p class="text-sm text-gray-600">
          {{ t('raid.cluster_md.confirm_phrase_hint') }}
          <code class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono text-xs">{{ effectiveConfirmationPhrase }}</code>
        </p>
        <UInput
          v-model="inputPhrase"
          :placeholder="effectiveConfirmationPhrase"
          :disabled="executing"
          class="font-mono"
          @paste.prevent
        />
      </div>
    </div>

    <template #actions>
      <UButton color="gray" variant="outline" size="sm" :disabled="executing" @click="$emit('cancel')">
        {{ t('common.actions.cancel') }}
      </UButton>
      <UButton
        :color="showLocalRecoveryMode ? 'red' : (riskLevel === 'destructive' ? 'red' : 'amber')"
        size="sm"
        :loading="executing"
        :disabled="!canConfirm"
        @click="execute"
      >
        {{ confirmLabel }}
      </UButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import type {
  AssembleMdArrayRequest,
  ClusterDiskMappingInput,
  ClusterMdExecutionPlan,
  ClusterMdExecutionResult,
  ClusterMdPreflightAction,
  ClusterMdRecoveryAssessment,
  ClusterMdRecoveryMode,
  ClusterDiskMapping,
  ClusterStoragePreflightResult,
  MdLocalRecoveryOffered,
  RaidPreflightResult,
  RaidRiskLevel,
  WipeMdSignaturesRequest,
  ZeroMdSuperblocksRequest,
} from '~/types/raid'
import { filterPartitionMappingsForDevices } from '~/utils/raid-cluster-mapping'
import { expectedLocalCleanupConfirmation } from '~/utils/raid-local-recovery-confirm'
import { isMdMetadataCleanupSuccessful } from '~/utils/stopped-md'

const props = defineProps<{
  action: ClusterMdPreflightAction
  sourceSanId: string
  clusterId: string
  title: string
  description: string
  riskLevel: RaidRiskLevel
  confirmationPhrase: string
  localPreflight: RaidPreflightResult | null
  payload: Record<string, unknown>
  arrayName?: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()

const { t } = useEsosI18n()
const raid = useRaidStore()
const toast = useAppToast()

const clusterLoading = ref(false)
const clusterPreflight = ref<ClusterStoragePreflightResult | null>(null)
const executionPlan = ref<ClusterMdExecutionPlan | null>(null)
const executionResult = ref<ClusterMdExecutionResult | null>(null)
const planError = ref<string | null>(null)
const inputPhrase = ref('')
const executing = ref(false)
const selectedRecoveryMode = ref<ClusterMdRecoveryMode | null>(null)
const showLocalRecoveryMode = ref(false)
const showMappingResolver = ref(false)
const localRecoveryPhrase = ref('')
const manualMappingSelection = reactive<Record<string, string>>({})

const isCleanupAction = computed(() =>
  props.action === 'zero_md_superblocks' || props.action === 'wipe_md_signatures',
)

const cleanupMembers = computed(() =>
  Array.isArray(props.payload.members) ? (props.payload.members as string[]) : [],
)

const localRecoveryOffered = computed((): MdLocalRecoveryOffered | undefined =>
  clusterPreflight.value?.localRecoveryOffered,
)

const showMappingFork = computed(() =>
  isCleanupAction.value
  && Boolean(localRecoveryOffered.value?.allowed)
  && !clusterPreflight.value?.ok
  && !showLocalRecoveryMode.value,
)

const localRecoveryConfirmationPhrase = computed(() => {
  const label = localRecoveryOffered.value?.primaryLabel ?? ''
  return label ? expectedLocalCleanupConfirmation(label) : ''
})

const ambiguousMappings = computed(() =>
  clusterPreflight.value?.mappings.filter(m =>
    m.confidence === 'none' && (m.candidates?.length ?? 0) > 0,
  ) ?? [],
)

function mappingKey(mapping: ClusterDiskMapping): string {
  return `${mapping.sourcePath}:${mapping.targetSanId}`
}

function nodeLabel(sanId: string): string {
  return clusterPreflight.value?.nodes.find(n => n.sanId === sanId)?.label ?? sanId
}

const manualMappingComplete = computed(() =>
  ambiguousMappings.value.length > 0
  && ambiguousMappings.value.every(m => Boolean(manualMappingSelection[mappingKey(m)])),
)

const manualDiskMappings = computed((): ClusterDiskMappingInput[] =>
  ambiguousMappings.value
    .map((m) => {
      const targetPath = manualMappingSelection[mappingKey(m)]
      if (!targetPath) return null
      return {
        sourcePath: m.sourcePath,
        targetSanId: m.targetSanId,
        targetPath,
        confirmedBy: 'operator' as const,
        sourceKind: 'partition' as const,
      }
    })
    .filter((m): m is ClusterDiskMappingInput => m !== null),
)

const diskMappings = computed((): ClusterDiskMappingInput[] => {
  const hint = raid.getPreparedClusterMappings(props.sourceSanId, props.clusterId)
  const members = Array.isArray(props.payload.members)
    ? (props.payload.members as string[])
    : []
  const base = hint && members.length
    ? filterPartitionMappingsForDevices(hint.partitionMappings, members)
    : (hint?.partitionMappings ?? [])
  const merged = [...base, ...manualDiskMappings.value]
  const seen = new Set<string>()
  return merged.filter((m) => {
    const key = `${m.sourcePath}:${m.targetSanId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
})

const recoveryAssessment = computed((): ClusterMdRecoveryAssessment | undefined =>
  executionPlan.value?.recoveryAssessment
  ?? clusterPreflight.value?.recoveryAssessment,
)

const recoveryModeOptions = computed(() => {
  const modes = recoveryAssessment.value?.allowedRecoveryModes ?? []
  return modes.map(mode => ({
    value: mode,
    label: t(`raid.cluster_md.recovery.mode.${mode}`),
  }))
})

const uuidConflict = computed(() => recoveryAssessment.value?.uuidConflict)

const uuidConflictDescription = computed(() => {
  if (!uuidConflict.value) return ''
  return t('raid.cluster_md.recovery.uuid_conflict_description', {
    name: uuidConflict.value.arrayName,
  })
})

const effectiveStopRecoveryMode = computed(
  () => selectedRecoveryMode.value ?? recoveryAssessment.value?.recommendedRecoveryMode ?? null,
)

const isInconsistentStopMode = computed(
  () => props.action === 'stop_md' && effectiveStopRecoveryMode.value === 'stop_inconsistent_active',
)

const isDegradedMode = computed(() =>
  effectiveStopRecoveryMode.value != null
  && effectiveStopRecoveryMode.value !== 'stop_all_active'
  && effectiveStopRecoveryMode.value !== 'assemble_stopped_nodes',
)

const degradedAlertTitle = computed(() => {
  if (props.action === 'stop_md' && isInconsistentStopMode.value) {
    return t('raid.cluster_md.recovery.stop_inconsistent_title')
  }
  if (props.action === 'stop_md') return t('raid.cluster_md.recovery.stop_active_only_title')
  if (props.action === 'assemble_md') return t('raid.cluster_md.recovery.assemble_missing_only_title')
  return t('raid.cluster_md.recovery.degraded_title')
})

const degradedAlertDescription = computed(() => {
  if (props.action === 'stop_md' && isInconsistentStopMode.value) {
    return t('raid.cluster_md.recovery.stop_inconsistent_description')
  }
  if (props.action === 'stop_md') return t('raid.cluster_md.recovery.stop_active_only_description')
  if (props.action === 'assemble_md') return t('raid.cluster_md.recovery.assemble_missing_only_description')
  return t('raid.cluster_md.recovery.degraded_description')
})

const effectiveConfirmationPhrase = computed(() =>
  executionPlan.value?.confirmationPhrase ?? props.confirmationPhrase,
)

function clusterExecutionPayload(): import('~/types/raid').ClusterMdExecutionRequest {
  const mode = selectedRecoveryMode.value ?? recoveryAssessment.value?.recommendedRecoveryMode
  const degraded = mode != null && mode !== 'stop_all_active' && mode !== 'assemble_stopped_nodes'
  return {
    clusterId: props.clusterId,
    primarySanId: props.sourceSanId,
    diskMappings: diskMappings.value,
    requirePreflightOk: true,
    stopOnFirstFailure: true,
    executionScope: 'all_nodes',
    recoveryMode: mode ?? undefined,
    degradedOk: degraded ? true : undefined,
    planToken: executionPlan.value?.planToken,
  }
}

const planReady = computed(() =>
  Boolean(executionPlan.value?.nodeResults.length)
  && executionPlan.value!.nodeResults.some(n => n.participation === 'execute' && n.command),
)

const canConfirm = computed(() => {
  if (executing.value) return false
  if (showLocalRecoveryMode.value) {
    return Boolean(localRecoveryConfirmationPhrase.value)
      && localRecoveryPhrase.value === localRecoveryConfirmationPhrase.value
      && cleanupMembers.value.length > 0
  }
  if (isCleanupAction.value && !showLocalRecoveryMode.value) {
    return planReady.value && inputPhrase.value === effectiveConfirmationPhrase.value
  }
  return planReady.value
    && (recoveryAssessment.value?.allowedRecoveryModes.length ?? 0) > 0
    && (props.localPreflight?.ok ?? true)
    && inputPhrase.value === effectiveConfirmationPhrase.value
})

function enterLocalRecoveryMode() {
  showLocalRecoveryMode.value = true
  showMappingResolver.value = false
  planError.value = null
  localRecoveryPhrase.value = ''
}

async function retryClusterCleanupAfterMapping() {
  showMappingResolver.value = false
  showLocalRecoveryMode.value = false
  await loadCleanupPlan()
}

const confirmLabel = computed(() => {
  if (showLocalRecoveryMode.value) {
    return t('raid.cluster_md.local_recovery.confirm_run_local')
  }
  if (isInconsistentStopMode.value) {
    return t('raid.cluster_md.recovery.confirm_stop_inconsistent')
  }
  if (isDegradedMode.value && props.action === 'stop_md') {
    return t('raid.cluster_md.recovery.confirm_stop_active_only')
  }
  if (props.action === 'stop_md') return t('raid.cluster_md.confirm_stop')
  if (props.action === 'assemble_md') return t('raid.cluster_md.confirm_assemble')
  return t('raid.cluster_md.confirm_cleanup')
})

async function loadRecoveryPlan() {
  if (props.action === 'stop_md' && props.arrayName) {
    executionPlan.value = await raid.planStopMdArray(props.arrayName, {
      ...clusterExecutionPayload(),
      recoveryMode: selectedRecoveryMode.value ?? undefined,
    })
  } else if (props.action === 'assemble_md') {
    executionPlan.value = await raid.planAssembleMdArray({
      ...(props.payload as Omit<AssembleMdArrayRequest, 'confirmation' | 'clusterExecution'>),
      confirmation: effectiveConfirmationPhrase.value,
      clusterExecution: {
        ...clusterExecutionPayload(),
        recoveryMode: selectedRecoveryMode.value ?? undefined,
      },
    })
  }
  if (executionPlan.value?.recoveryAssessment?.recommendedRecoveryMode && !selectedRecoveryMode.value) {
    selectedRecoveryMode.value = executionPlan.value.recoveryAssessment.recommendedRecoveryMode
  }
}

async function loadPlan() {
  clusterLoading.value = true
  planError.value = null
  executionPlan.value = null
  clusterPreflight.value = null
  try {
    clusterPreflight.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId,
      primarySanId: props.sourceSanId,
      action: props.action,
      payload: props.payload,
      diskMappings: diskMappings.value,
    })

    const assessment = clusterPreflight.value.recoveryAssessment
    if (assessment) {
      if (!clusterPreflight.value.okDegraded && !assessment.allowedRecoveryModes.length) {
        planError.value = assessment.hardBlockers.join('; ')
          || clusterPreflight.value.blockers.join('; ')
        return
      }
      selectedRecoveryMode.value = assessment.recommendedRecoveryMode
        ?? assessment.allowedRecoveryModes[0]
        ?? null
      await loadRecoveryPlan()
      return
    }

    if (!clusterPreflight.value.ok) {
      planError.value = clusterPreflight.value.blockers.join('; ')
      return
    }
    await loadRecoveryPlan()
  } catch (err: any) {
    planError.value = err?.data?.statusMessage ?? err.message ?? t('raid.cluster_md.plan_error_title')
  } finally {
    clusterLoading.value = false
  }
}

watch(selectedRecoveryMode, async (mode, prev) => {
  if (!mode || mode === prev || clusterLoading.value) return
  if (props.action !== 'stop_md' && props.action !== 'assemble_md') return
  clusterLoading.value = true
  planError.value = null
  inputPhrase.value = ''
  try {
    await loadRecoveryPlan()
  } catch (err: any) {
    planError.value = err?.data?.statusMessage ?? err.message
  } finally {
    clusterLoading.value = false
  }
})

async function executeLocalRecovery() {
  const confirmation = localRecoveryPhrase.value
  const members = cleanupMembers.value
  const localRecovery = {
    scope: 'local' as const,
    sanId: props.sourceSanId,
    members,
    confirmation,
    reason: 'mapping_ambiguous' as const,
  }
  if (props.action === 'zero_md_superblocks') {
    const res = await raid.zeroMdSuperblocks({
      ...(props.payload as Omit<ZeroMdSuperblocksRequest, 'confirmation' | 'clusterExecution' | 'localRecovery'>),
      members,
      confirmation,
      mode: 'basic',
      localRecovery,
    })
    if (res.warnings?.some(w => w.includes('pairs'))) {
      toast.warning(t('raid.cluster_md.local_recovery.peers_not_modified'))
    }
    return
  }
  if (props.action === 'wipe_md_signatures') {
    const res = await raid.wipeMdSignatures({
      ...(props.payload as Omit<WipeMdSignaturesRequest, 'confirmation' | 'clusterExecution' | 'localRecovery'>),
      members,
      confirmation,
      mode: 'advanced',
      localRecovery,
    })
    if (res.warnings?.some(w => w.includes('pairs') || w.includes('pairs du cluster'))) {
      toast.warning(t('raid.cluster_md.local_recovery.peers_not_modified'))
    }
  }
}

async function execute() {
  if (!canConfirm.value) return
  executing.value = true
  executionResult.value = null
  try {
    if (showLocalRecoveryMode.value) {
      await executeLocalRecovery()
      toast.success(t('raid.cluster_md.local_recovery.toast_success'))
      emit('confirm')
      return
    }
    const confirmation = inputPhrase.value
    const clusterExecution = clusterExecutionPayload()
    if (props.action === 'stop_md' && props.arrayName) {
      const res = await raid.stopMdArray(props.arrayName, confirmation, clusterExecution)
      executionResult.value = res.clusterExecution ?? null
    } else if (props.action === 'assemble_md') {
      const res = await raid.assembleMdArray({
        ...(props.payload as Omit<AssembleMdArrayRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        clusterExecution,
      })
      executionResult.value = res.clusterExecution ?? null
    } else if (props.action === 'zero_md_superblocks') {
      const res = await raid.zeroMdSuperblocks({
        ...(props.payload as Omit<ZeroMdSuperblocksRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        mode: 'basic',
        clusterExecution,
      })
      executionResult.value = res.clusterExecution ?? null
      if (!isMdMetadataCleanupSuccessful(res)) {
        toast.warning(t('raid.stopped_md.toast_cluster_cleanup_partial'))
        return
      }
    } else if (props.action === 'wipe_md_signatures') {
      const res = await raid.wipeMdSignatures({
        ...(props.payload as Omit<WipeMdSignaturesRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        mode: 'advanced',
        clusterExecution,
      })
      executionResult.value = res.clusterExecution ?? null
      if (!isMdMetadataCleanupSuccessful(res)) {
        toast.warning(t('raid.stopped_md.toast_cluster_cleanup_partial'))
        return
      }
    }
    toast.success(t('raid.cluster_md.toast_success'))
    emit('confirm')
  } catch (err: any) {
    const clusterExec = err?.data?.clusterExecution as ClusterMdExecutionResult | undefined
    if (clusterExec?.nodeResults?.length) {
      executionResult.value = clusterExec
    }
    toast.error(t('raid.cluster_md.toast_failed'), err?.data?.statusMessage ?? err.message)
  } finally {
    executing.value = false
  }
}

onMounted(() => {
  if (props.action === 'zero_md_superblocks' || props.action === 'wipe_md_signatures') {
    void loadCleanupPlan()
  } else {
    void loadPlan()
  }
})

async function loadCleanupPlan() {
  clusterLoading.value = true
  planError.value = null
  showLocalRecoveryMode.value = false
  try {
    clusterPreflight.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId,
      primarySanId: props.sourceSanId,
      action: props.action,
      payload: props.payload,
      diskMappings: diskMappings.value,
    })
    if (!clusterPreflight.value.ok) {
      if (clusterPreflight.value.localRecoveryOffered?.allowed) {
        return
      }
      planError.value = clusterPreflight.value.blockers.join('; ')
      return
    }
    if (props.action === 'zero_md_superblocks') {
      executionPlan.value = await raid.planZeroMdSuperblocks({
        ...(props.payload as Omit<ZeroMdSuperblocksRequest, 'confirmation' | 'clusterExecution'>),
        confirmation: props.confirmationPhrase,
        mode: 'basic',
        clusterExecution: clusterExecutionPayload(),
      })
    } else {
      executionPlan.value = await raid.planWipeMdSignatures({
        ...(props.payload as Omit<WipeMdSignaturesRequest, 'confirmation' | 'clusterExecution'>),
        confirmation: props.confirmationPhrase,
        mode: 'advanced',
        clusterExecution: clusterExecutionPayload(),
      })
    }
  } catch (err: any) {
    planError.value = err?.data?.statusMessage ?? err.message
  } finally {
    clusterLoading.value = false
  }
}
</script>
