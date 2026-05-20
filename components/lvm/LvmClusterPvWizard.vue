<template>
  <LvmWizardModalShell
    :title="t('lvm.cluster.wizard.pv_create.title')"
    :step="step"
    :total-steps="5"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UFormGroup
          :label="t('lvm.wizard.pv_create.device')"
          :hint="t('lvm.wizard.pv_create.device_help')"
        >
          <LvmNativeSelect v-model="selectedPath" :options="deviceOptions" />
        </UFormGroup>
        <UCheckbox v-model="force" :label="t('lvm.wizard.pv_create.force')" />
        <p v-if="selectedClusterBlock" class="text-xs text-red-600">{{ selectedClusterBlock }}</p>
      </template>
      <template v-else-if="step === 2">
        <LvmClusterMappingPanel
          v-if="inventory.length && selectedPath"
          :source-san-id="sanId"
          :source-path="selectedPath"
          :inventory="inventory"
          :mappings="diskMappings"
          @update:mappings="diskMappings = $event"
        />
        <div v-if="preflightLoading" class="text-sm text-gray-500">{{ t('lvm.cluster.wizard.preflight_loading') }}</div>
        <LvmClusterPreflightPanel v-else-if="clusterPreflight" :preflight="clusterPreflight" />
      </template>
      <template v-else-if="step === 3">
        <LvmClusterPlanReview v-if="plan" :plan="plan" />
        <UAlert v-if="planError" color="red" variant="soft" :title="planError" />
      </template>
      <template v-else-if="step === 4">
        <UFormGroup :label="t('lvm.confirm.label')">
          <UInput v-model="confirmation" :placeholder="plan?.confirmationPhrase" />
        </UFormGroup>
      </template>
      <template v-else>
        <LvmClusterExecutionResults v-if="executionResult" :result="executionResult" />
      </template>
    </div>
    <template #footer>
      <div class="flex justify-between gap-2">
        <UButton v-if="step > 1 && step < 5" color="gray" variant="ghost" @click="step--">{{ t('lvm.cluster.wizard.back') }}</UButton>
        <span v-else />
        <div class="flex gap-2">
          <UButton color="gray" variant="ghost" @click="onCancel">{{ step === 5 ? t('lvm.cluster.wizard.close') : t('lvm.wizard.cancel') }}</UButton>
          <UButton
            v-if="step < 4"
            color="primary"
            :disabled="step === 1 && (!selectedPath || !!selectedClusterBlock)"
            :loading="preflightLoading || planLoading"
            @click="nextStep"
          >
            {{ t('lvm.cluster.wizard.next') }}
          </UButton>
          <UButton
            v-else-if="step === 4"
            color="primary"
            :loading="busy"
            :disabled="!plan?.okSymmetric || confirmation !== plan?.confirmationPhrase"
            @click="execute"
          >
            {{ t('lvm.cluster.wizard.pv_create.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionResult,
  ClusterLvmPreflightResult,
} from '~/types/lvm'
import { filterClusterEligibleCandidates } from '~/utils/lvm-cluster-ui'

const props = defineProps<{
  sanId: string
  clusterId: string
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const step = ref(1)
const selectedPath = ref('')
const force = ref(false)
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterPvCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)
const diskMappings = ref<ClusterLvmDiskMapping[]>([])
const clusterPreflight = ref<ClusterLvmPreflightResult | null>(null)
const preflightLoading = ref(false)
const executionResult = ref<ClusterLvmExecutionResult | null>(null)

const inventory = computed(() => lvm.clusterInventory ?? [])

const clusterCandidates = computed(() =>
  filterClusterEligibleCandidates(props.sanId, lvm.candidates, inventory.value),
)

const deviceOptions = computed(() =>
  clusterCandidates.value.map(c => ({
    value: c.path,
    label: (c as { clusterBlockReason?: string }).clusterBlockReason
      ? `${c.path} (${(c as { clusterBlockReason?: string }).clusterBlockReason})`
      : c.path,
    disabled: !!((c as { clusterBlockReason?: string }).clusterBlockReason) || (!c.eligible && !force.value),
  })),
)

const selectedClusterBlock = computed(() => {
  const c = clusterCandidates.value.find(x => x.path === selectedPath.value)
  return (c as { clusterBlockReason?: string } | undefined)?.clusterBlockReason
})

onMounted(async () => {
  lvm.setSanId(props.sanId)
  lvm.setClusterContext(props.clusterId, props.sanId)
  await lvm.fetchClusterInventory(props.clusterId)
  const eligible = clusterCandidates.value.filter(
    c => c.eligible && !(c as { clusterBlockReason?: string }).clusterBlockReason,
  )
  selectedPath.value = eligible[0]?.path ?? ''
})

function onCancel() {
  if (step.value === 5) emit('close')
  else emit('cancel')
}

function initMappingsFromInventory() {
  const mappings: ClusterLvmDiskMapping[] = []
  for (const peer of inventory.value.filter(n => n.sanId !== props.sanId)) {
    const peerPath = peer.overview.candidates.find(c => c.path === selectedPath.value && c.eligible)?.path
      ?? (peer.mdArrays?.some(a => `/dev/${a.name}` === selectedPath.value) ? selectedPath.value : '')
    if (peerPath) {
      mappings.push({
        sourceSanId: props.sanId,
        peerSanId: peer.sanId,
        sourcePath: selectedPath.value,
        peerPath,
        stableKey: selectedPath.value,
      })
    }
  }
  diskMappings.value = mappings
  lvm.lastDiskMappings = mappings
}

async function runPreflight() {
  preflightLoading.value = true
  try {
    clusterPreflight.value = await lvm.clusterPreflight({
      clusterId: props.clusterId,
      primarySanId: props.sanId,
      action: 'pvcreate',
      payload: { path: selectedPath.value, force: force.value, confirmation: '' },
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: diskMappings.value,
      },
    })
    if (clusterPreflight.value.mappings.length) {
      diskMappings.value = clusterPreflight.value.mappings
      lvm.lastDiskMappings = clusterPreflight.value.mappings
    }
  } finally {
    preflightLoading.value = false
  }
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  try {
    plan.value = await lvm.planClusterPvCreate({
      path: selectedPath.value,
      force: force.value,
      confirmation: '',
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: diskMappings.value,
      },
    })
    lvm.lastClusterPlan = plan.value
    if (!plan.value.okSymmetric) {
      planError.value = plan.value.blockers.join(' · ') || t('lvm.cluster.wizard.plan_invalid')
    }
  } catch (e: any) {
    planError.value = e?.data?.statusMessage ?? e?.statusMessage ?? e?.message ?? 'Erreur plan'
    plan.value = null
  } finally {
    planLoading.value = false
  }
}

async function nextStep() {
  if (step.value === 1) {
    initMappingsFromInventory()
    step.value = 2
    await runPreflight()
    return
  }
  if (step.value === 2) {
    if (!clusterPreflight.value?.ok) return
    await loadPlan()
    if (!plan.value?.okSymmetric) return
    step.value = 3
    return
  }
  if (step.value === 3) {
    if (!plan.value?.okSymmetric) return
    step.value = 4
  }
}

async function execute() {
  if (!plan.value || !selectedPath.value) return
  busy.value = true
  try {
    executionResult.value = await lvm.executeClusterPvCreate({
      path: selectedPath.value,
      force: force.value,
      confirmation: confirmation.value,
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: diskMappings.value,
      },
    })
    step.value = 5
    if (executionResult.value.success) {
      toast.add({ title: t('lvm.cluster.wizard.pv_create.success'), color: 'green' })
      emit('close')
    }
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
