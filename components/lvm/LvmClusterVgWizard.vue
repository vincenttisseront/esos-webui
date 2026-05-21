<template>
  <LvmWizardModalShell
    :title="t('lvm.cluster.wizard.vg_create.title')"
    :step="step"
    :total-steps="5"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UFormGroup :label="t('lvm.wizard.vg_create.name')">
          <UInput v-model="vgName" placeholder="data" />
        </UFormGroup>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('lvm.wizard.vg_create.pv_hint') }}</p>
        <div class="space-y-1 max-h-40 overflow-y-auto">
          <label v-for="pv in lvm.orphanPvs" :key="pv.path" class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="selectedPvs" type="checkbox" :value="pv.path" class="accent-primary-500">
            <span class="font-mono">{{ pv.path }}</span>
          </label>
        </div>
      </template>
      <template v-else-if="step === 2">
        <div v-if="preflightLoading" class="text-sm text-gray-500 dark:text-gray-400">{{ t('lvm.cluster.wizard.preflight_loading') }}</div>
        <UAlert
          v-else-if="clusterPreflightError"
          color="red"
          variant="soft"
          icon="i-heroicons-shield-exclamation"
          :title="clusterPreflightError"
        />
        <LvmClusterPreflightPanel v-else-if="clusterPreflight" :preflight="clusterPreflight" />
      </template>
      <template v-else-if="step === 3">
        <LvmClusterPlanReview v-if="plan" :plan="plan" />
        <UAlert v-if="planError" color="red" variant="soft" :title="planError" />
      </template>
      <template v-else-if="step === 4">
        <LvmClusterVgConfirmStep
          ref="confirmStepRef"
          v-model:confirmation="confirmation"
          :vg-name="vgName"
          :pv-paths="selectedPvs"
          :primary-san-id="sanId"
          :mappings="diskMappings"
          :preflight="clusterPreflight"
          :plan="plan"
        />
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
            :disabled="step === 1 && (!vgName || !selectedPvs.length)"
            :loading="preflightLoading || planLoading"
            @click="nextStep"
          >
            {{ t('lvm.cluster.wizard.next') }}
          </UButton>
          <UButton
            v-else-if="step === 4"
            color="primary"
            :loading="busy"
            :disabled="!confirmStepRef?.canExecute"
            @click="execute"
          >
            {{ t('lvm.cluster.wizard.vg_create.execute') }}
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
import { resolveLvmClusterPreflightError } from '~/utils/lvm-wizard-ui'

const props = defineProps<{ sanId: string; clusterId: string }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t, tError } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const step = ref(1)
const vgName = ref('')
const selectedPvs = ref<string[]>([])
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterVgCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)
const diskMappings = ref<ClusterLvmDiskMapping[]>([])
const clusterPreflight = ref<ClusterLvmPreflightResult | null>(null)
const clusterPreflightError = ref<string | null>(null)
const preflightLoading = ref(false)
const executionResult = ref<ClusterLvmExecutionResult | null>(null)
const confirmStepRef = ref<{ canExecute: boolean } | null>(null)

onMounted(async () => {
  lvm.setSanId(props.sanId)
  lvm.setClusterContext(props.clusterId, props.sanId)
  await lvm.fetchClusterInventory(props.clusterId)
  selectedPvs.value = lvm.orphanPvs.map(p => p.path)
  diskMappings.value = lvm.lastDiskMappings
})

function onCancel() {
  if (step.value === 5) emit('close')
  else emit('cancel')
}

async function runPreflight(): Promise<boolean> {
  preflightLoading.value = true
  clusterPreflightError.value = null
  clusterPreflight.value = null
  try {
    clusterPreflight.value = await lvm.clusterPreflight({
      clusterId: props.clusterId,
      primarySanId: props.sanId,
      action: 'vgcreate',
      payload: { name: vgName.value, pvPaths: selectedPvs.value, confirmation: '' },
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
    if (!clusterPreflight.value.ok) {
      clusterPreflightError.value = clusterPreflight.value.blockers.join(' · ')
        || t('lvm.cluster.preflight_failed')
      return false
    }
    return true
  } catch (e: unknown) {
    clusterPreflightError.value = resolveLvmClusterPreflightError(e, t, tError)
    return false
  } finally {
    preflightLoading.value = false
  }
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  try {
    plan.value = await lvm.planClusterVgCreate({
      name: vgName.value,
      pvPaths: selectedPvs.value,
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
    step.value = 2
    const ok = await runPreflight()
    if (!ok) return
    return
  }
  if (step.value === 2) {
    if (!clusterPreflight.value?.ok || clusterPreflightError.value) return
    await loadPlan()
    if (!plan.value?.okSymmetric) return
    step.value = 3
    return
  }
  if (step.value === 3) {
    if (!plan.value?.okSymmetric) return
    confirmation.value = ''
    step.value = 4
  }
}

async function execute() {
  if (!plan.value || !confirmStepRef.value?.canExecute) return
  busy.value = true
  try {
    executionResult.value = await lvm.executeClusterVgCreate({
      name: vgName.value,
      pvPaths: selectedPvs.value,
      confirmation: confirmation.value,
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: diskMappings.value,
      },
    })
    step.value = 5
    if (executionResult.value.success) {
      toast.success(t('lvm.cluster.wizard.vg_create.success'))
      emit('close')
    }
  } catch (e: any) {
    toast.error(t('lvm.wizard.execute_failed'), e?.statusMessage ?? 'Erreur')
  } finally {
    busy.value = false
  }
}
</script>
