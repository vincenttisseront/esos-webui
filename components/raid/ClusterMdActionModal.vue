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
        :title="t('raid.cluster_md.all_nodes_title')"
        :description="t('raid.cluster_md.all_nodes_description')"
        color="amber"
        icon="i-heroicons-server-stack"
        variant="soft"
      />

      <RaidPreflightPanel v-if="localPreflight" :preflight="localPreflight" />

      <div v-if="clusterLoading" class="text-sm text-gray-500 flex items-center gap-2">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
        {{ t('raid.cluster_md.preflight_loading') }}
      </div>
      <ClusterStoragePreflightPanel v-else-if="clusterPreflight" :preflight="clusterPreflight" />

      <ClusterMdExecutionPlanTable
        v-if="executionPlan?.nodeResults.length"
        :title="t('raid.cluster_md.execution_plan_title')"
        :node-results="executionPlan.nodeResults"
      />

      <ClusterMdExecutionPlanTable
        v-if="executionResult?.nodeResults.length"
        :title="t('raid.cluster_md.execution_results_title')"
        :node-results="executionResult.nodeResults"
        show-output
      />

      <UAlert
        v-if="planError"
        :title="t('raid.cluster_md.plan_error_title')"
        :description="planError"
        color="red"
        icon="i-heroicons-x-circle"
      />

      <div v-if="confirmationPhrase" class="space-y-2">
        <p class="text-sm text-gray-600">
          {{ t('raid.cluster_md.confirm_phrase_hint') }}
          <code class="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-mono text-xs">{{ confirmationPhrase }}</code>
        </p>
        <UInput
          v-model="inputPhrase"
          :placeholder="confirmationPhrase"
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
        :color="riskLevel === 'destructive' ? 'red' : 'amber'"
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
  ClusterStoragePreflightResult,
  RaidPreflightResult,
  RaidRiskLevel,
  WipeMdSignaturesRequest,
  ZeroMdSuperblocksRequest,
} from '~/types/raid'
import { filterPartitionMappingsForDevices } from '~/utils/raid-cluster-mapping'

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

const diskMappings = computed((): ClusterDiskMappingInput[] => {
  const hint = raid.getPreparedClusterMappings(props.sourceSanId, props.clusterId)
  const members = Array.isArray(props.payload.members)
    ? (props.payload.members as string[])
    : []
  if (hint && members.length) {
    return filterPartitionMappingsForDevices(hint.partitionMappings, members)
  }
  return hint?.partitionMappings ?? []
})

const clusterExecutionBase = computed(() => ({
  clusterId: props.clusterId,
  primarySanId: props.sourceSanId,
  diskMappings: diskMappings.value,
  requirePreflightOk: true as const,
  stopOnFirstFailure: true as const,
  executionScope: 'all_nodes' as const,
}))

const planReady = computed(() =>
  Boolean(executionPlan.value?.nodeResults.length)
  && executionPlan.value!.nodeResults.every(n => n.command),
)

const canConfirm = computed(() =>
  !executing.value
  && planReady.value
  && (clusterPreflight.value?.ok ?? false)
  && (props.localPreflight?.ok ?? true)
  && inputPhrase.value === props.confirmationPhrase,
)

const confirmLabel = computed(() => {
  if (props.action === 'stop_md') return t('raid.cluster_md.confirm_stop')
  if (props.action === 'assemble_md') return t('raid.cluster_md.confirm_assemble')
  return t('raid.cluster_md.confirm_cleanup')
})

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
    if (!clusterPreflight.value.ok) {
      planError.value = clusterPreflight.value.blockers.join('; ')
      return
    }
    if (props.action === 'stop_md' && props.arrayName) {
      executionPlan.value = await raid.planStopMdArray(props.arrayName, clusterExecutionBase.value)
    } else if (props.action === 'assemble_md') {
      executionPlan.value = await raid.planAssembleMdArray({
        ...(props.payload as Omit<AssembleMdArrayRequest, 'confirmation' | 'clusterExecution'>),
        confirmation: props.confirmationPhrase,
        clusterExecution: clusterExecutionBase.value,
      })
    }
  } catch (err: any) {
    planError.value = err?.data?.statusMessage ?? err.message ?? t('raid.cluster_md.plan_error_title')
  } finally {
    clusterLoading.value = false
  }
}

async function execute() {
  if (!canConfirm.value) return
  executing.value = true
  executionResult.value = null
  try {
    const confirmation = inputPhrase.value
    if (props.action === 'stop_md' && props.arrayName) {
      const res = await raid.stopMdArray(props.arrayName, confirmation, clusterExecutionBase.value)
      executionResult.value = res.clusterExecution ?? null
    } else if (props.action === 'assemble_md') {
      const res = await raid.assembleMdArray({
        ...(props.payload as Omit<AssembleMdArrayRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        clusterExecution: clusterExecutionBase.value,
      })
      executionResult.value = res.clusterExecution ?? null
    } else if (props.action === 'zero_md_superblocks') {
      const res = await raid.zeroMdSuperblocks({
        ...(props.payload as Omit<ZeroMdSuperblocksRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        mode: 'basic',
        clusterExecution: clusterExecutionBase.value,
      })
      executionResult.value = res.clusterExecution ?? null
    } else if (props.action === 'wipe_md_signatures') {
      const res = await raid.wipeMdSignatures({
        ...(props.payload as Omit<WipeMdSignaturesRequest, 'confirmation' | 'clusterExecution'>),
        confirmation,
        mode: 'advanced',
        clusterExecution: clusterExecutionBase.value,
      })
      executionResult.value = res.clusterExecution ?? null
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
  try {
    clusterPreflight.value = await raid.clusterStoragePreflight({
      clusterId: props.clusterId,
      primarySanId: props.sourceSanId,
      action: props.action,
      payload: props.payload,
      diskMappings: diskMappings.value,
    })
    if (!clusterPreflight.value.ok) {
      planError.value = clusterPreflight.value.blockers.join('; ')
      return
    }
    if (props.action === 'zero_md_superblocks') {
      executionPlan.value = await raid.planZeroMdSuperblocks({
        ...(props.payload as Omit<ZeroMdSuperblocksRequest, 'confirmation' | 'clusterExecution'>),
        confirmation: props.confirmationPhrase,
        mode: 'basic',
        clusterExecution: clusterExecutionBase.value,
      })
    } else {
      executionPlan.value = await raid.planWipeMdSignatures({
        ...(props.payload as Omit<WipeMdSignaturesRequest, 'confirmation' | 'clusterExecution'>),
        confirmation: props.confirmationPhrase,
        mode: 'advanced',
        clusterExecution: clusterExecutionBase.value,
      })
    }
  } catch (err: any) {
    planError.value = err?.data?.statusMessage ?? err.message
  } finally {
    clusterLoading.value = false
  }
}
</script>
