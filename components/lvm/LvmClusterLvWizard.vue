<template>
  <LvmWizardModalShell
    :title="t('lvm.cluster.wizard.lv_create.title')"
    :step="step"
    :total-steps="4"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <LvmCreateLvFormStep
          v-model:vg-name="selectedVg"
          v-model:lv-name="lvName"
          v-model:size-gib="sizeGib"
          :vg-options="vgOptions"
          :max-free-bytes="maxFreeAcrossCluster"
          cluster-mode
          :target-node-labels="targetNodeLabels"
          :size-error="sizeValidationError"
        />
      </template>
      <template v-else-if="step === 2">
        <LvmClusterPlanReview v-if="plan" :plan="plan" />
        <UAlert v-if="planError" color="red" variant="soft" :title="planError" />
      </template>
      <template v-else-if="step === 3">
        <LvmClusterLvConfirmStep
          ref="confirmStepRef"
          v-model:confirmation="confirmation"
          :vg-name="selectedVg"
          :lv-name="lvName"
          :size-gib="sizeGib"
          :target-node-labels="targetNodeLabels"
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
        <UButton v-if="step > 1 && step < 4" color="gray" variant="ghost" @click="step--">{{ t('lvm.cluster.wizard.back') }}</UButton>
        <span v-else />
        <div class="flex gap-2">
          <UButton color="gray" variant="ghost" @click="onCancel">{{ step === 4 ? t('lvm.cluster.wizard.close') : t('lvm.wizard.cancel') }}</UButton>
          <UButton
            v-if="step < 3"
            color="primary"
            :disabled="step === 1 && !formValid"
            :loading="planLoading"
            @click="nextStep"
          >
            {{ t('lvm.cluster.wizard.next') }}
          </UButton>
          <UButton
            v-else-if="step === 3"
            color="primary"
            :loading="busy"
            :disabled="!confirmStepRef?.canExecute"
            @click="execute"
          >
            {{ t('lvm.cluster.wizard.lv_create.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionResult, ClusterLvmPreflightResult } from '~/types/lvm'
import { minVgFreeBytesAcrossCluster } from '~/utils/lvm-cluster-ui'
import { formatLvmBytes, validateLvCreateSizeGib } from '~/utils/lvm-lv-wizard-ui'

const props = defineProps<{ sanId: string; clusterId: string }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const step = ref(1)
const selectedVg = ref('')
const lvName = ref('')
const sizeGib = ref(10)
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterLvCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)
const executionResult = ref<ClusterLvmExecutionResult | null>(null)
const clusterPreflight = ref<ClusterLvmPreflightResult | null>(null)
const confirmStepRef = ref<{ canExecute: boolean } | null>(null)

const sizeBytes = computed(() => Math.floor(Number(sizeGib.value) * 1024 ** 3))

const vgOptions = computed(() =>
  lvm.vgs
    .filter(v => !v.clustered)
    .map(v => ({ value: v.name, label: v.name })),
)

const maxFreeAcrossCluster = computed(() => {
  const local = lvm.vgs.find(v => v.name === selectedVg.value)?.freeBytes ?? 0
  return minVgFreeBytesAcrossCluster(selectedVg.value, props.sanId, local, lvm.clusterInventory)
})

const targetNodeLabels = computed(() =>
  (lvm.clusterInventory ?? [])
    .filter(n => n.sshReady)
    .map(n => n.label),
)

const sizeValidationKey = computed(() =>
  validateLvCreateSizeGib(Number(sizeGib.value), maxFreeAcrossCluster.value),
)

const sizeValidationError = computed(() => {
  switch (sizeValidationKey.value) {
    case 'zero':
      return t('lvm.wizard.lv_create.error_size_zero')
    case 'exceeds':
      return t('lvm.wizard.lv_create.error_size_exceeds', { max: formatLvmBytes(maxFreeAcrossCluster.value) })
    default:
      return null
  }
})

const formValid = computed(() =>
  !!selectedVg.value
  && !!lvName.value.trim()
  && !sizeValidationKey.value
  && maxFreeAcrossCluster.value > 0,
)

onMounted(async () => {
  lvm.setSanId(props.sanId)
  lvm.setClusterContext(props.clusterId, props.sanId)
  await lvm.fetchClusterInventory(props.clusterId)
  selectedVg.value = vgOptions.value[0]?.value ?? ''
})

function onCancel() {
  if (step.value === 4) emit('close')
  else emit('cancel')
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  clusterPreflight.value = null
  try {
    clusterPreflight.value = await lvm.clusterPreflight({
      action: 'lvcreate',
      payload: {
        vgName: selectedVg.value,
        name: lvName.value,
        sizeBytes: sizeBytes.value,
        confirmation: '',
      },
      clusterId: props.clusterId,
      primarySanId: props.sanId,
    })
    plan.value = await lvm.planClusterLvCreate({
      vgName: selectedVg.value,
      name: lvName.value,
      sizeBytes: sizeBytes.value,
      confirmation: '',
      clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId },
    })
    lvm.lastClusterPlan = plan.value
    if (!plan.value.okSymmetric) planError.value = plan.value.blockers.join(' · ')
  } catch (e: any) {
    planError.value = e?.statusMessage ?? e?.message
  } finally {
    planLoading.value = false
  }
}

async function nextStep() {
  if (step.value === 1) {
    if (!formValid.value) return
    await loadPlan()
    if (!plan.value?.okSymmetric) return
    step.value = 2
    return
  }
  if (step.value === 2) step.value = 3
}

async function execute() {
  if (!plan.value) return
  busy.value = true
  try {
    executionResult.value = await lvm.executeClusterLvCreate({
      vgName: selectedVg.value,
      name: lvName.value,
      sizeBytes: sizeBytes.value,
      confirmation: confirmation.value,
      clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId },
    })
    step.value = 4
    if (executionResult.value.success) {
      toast.success(t('lvm.cluster.wizard.lv_create.success'))
      emit('close')
    }
  } catch (e: any) {
    toast.error(t('lvm.wizard.execute_failed'), e?.statusMessage ?? 'Erreur')
  } finally {
    busy.value = false
  }
}
</script>
