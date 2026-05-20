<template>
  <LvmWizardModalShell
    :title="t('lvm.cluster.wizard.vg_create.title')"
    :step="step"
    :total-steps="4"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UFormGroup :label="t('lvm.wizard.vg_create.name')">
          <UInput v-model="vgName" placeholder="data" />
        </UFormGroup>
        <p class="text-sm text-gray-500">{{ t('lvm.wizard.vg_create.pv_hint') }}</p>
        <div class="space-y-1 max-h-40 overflow-y-auto">
          <label v-for="pv in lvm.orphanPvs" :key="pv.path" class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="selectedPvs" type="checkbox" :value="pv.path" class="accent-primary-500">
            <span class="font-mono">{{ pv.path }}</span>
          </label>
        </div>
      </template>
      <template v-else-if="step === 2">
        <LvmClusterPlanReview v-if="plan" :plan="plan" />
        <UAlert v-if="planError" color="red" variant="soft" :title="planError" />
      </template>
      <template v-else-if="step === 3">
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
        <UButton v-if="step > 1 && step < 4" color="gray" variant="ghost" @click="step--">{{ t('lvm.cluster.wizard.back') }}</UButton>
        <span v-else />
        <div class="flex gap-2">
          <UButton color="gray" variant="ghost" @click="onCancel">{{ step === 4 ? t('lvm.cluster.wizard.close') : t('lvm.wizard.cancel') }}</UButton>
          <UButton
            v-if="step < 3"
            color="primary"
            :disabled="step === 1 && (!vgName || !selectedPvs.length)"
            :loading="planLoading"
            @click="nextStep"
          >
            {{ t('lvm.cluster.wizard.next') }}
          </UButton>
          <UButton
            v-else-if="step === 3"
            color="primary"
            :loading="busy"
            :disabled="!plan?.okSymmetric || confirmation !== plan?.confirmationPhrase"
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
import type { ClusterLvmExecutionResult } from '~/types/lvm'

const props = defineProps<{ sanId: string; clusterId: string }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t } = useEsosI18n()
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
const executionResult = ref<ClusterLvmExecutionResult | null>(null)

onMounted(() => {
  lvm.setSanId(props.sanId)
  lvm.setClusterContext(props.clusterId, props.sanId)
  selectedPvs.value = lvm.orphanPvs.map(p => p.path)
})

function onCancel() {
  if (step.value === 4) emit('close')
  else emit('cancel')
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
        diskMappings: lvm.lastDiskMappings,
      },
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
    executionResult.value = await lvm.executeClusterVgCreate({
      name: vgName.value,
      pvPaths: selectedPvs.value,
      confirmation: confirmation.value,
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: lvm.lastDiskMappings,
      },
    })
    step.value = 4
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
