<template>
  <LvmWizardModalShell
    :title="t('lvm.cluster.wizard.lv_create.title')"
    :step="step"
    :total-steps="4"
    icon="i-heroicons-circle-stack"
  >
    <div class="space-y-4">
      <template v-if="step === 1">
        <UFormGroup
          :label="t('lvm.wizard.lv_create.vg')"
          :hint="t('lvm.wizard.lv_create.vg_help')"
        >
          <LvmNativeSelect v-model="selectedVg" :options="vgOptions" />
        </UFormGroup>
        <UFormGroup :label="t('lvm.wizard.lv_create.name')">
          <UInput v-model="lvName" placeholder="lv0" />
        </UFormGroup>
        <UFormGroup :label="t('lvm.wizard.lv_create.size_gib')">
          <UInput v-model.number="sizeGib" type="number" min="1" step="1" />
        </UFormGroup>
        <p class="text-xs text-gray-500">
          {{ t('lvm.cluster.wizard.lv_min_free', { size: formatBytes(minFreeAcrossCluster) }) }}
        </p>
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
            :disabled="step === 1 && (!selectedVg || !lvName || sizeGib < 1 || sizeBytes > minFreeAcrossCluster)"
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
            {{ t('lvm.cluster.wizard.lv_create.execute') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionResult } from '~/types/lvm'
import { minVgFreeBytesAcrossCluster } from '~/utils/lvm-cluster-ui'

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

const sizeBytes = computed(() => Math.floor(sizeGib.value * 1024 ** 3))

const vgOptions = computed(() =>
  lvm.vgs.filter(v => !v.clustered).map(v => ({ value: v.name, label: `${v.name} (${formatBytes(v.freeBytes)} free)` })),
)

const minFreeAcrossCluster = computed(() => {
  const local = lvm.vgs.find(v => v.name === selectedVg.value)?.freeBytes ?? 0
  return minVgFreeBytesAcrossCluster(selectedVg.value, props.sanId, local, lvm.clusterInventory)
})

onMounted(async () => {
  lvm.setSanId(props.sanId)
  lvm.setClusterContext(props.clusterId, props.sanId)
  await lvm.fetchClusterInventory(props.clusterId)
  selectedVg.value = vgOptions.value[0]?.value ?? ''
})

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

function onCancel() {
  if (step.value === 4) emit('close')
  else emit('cancel')
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  try {
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
      toast.add({ title: t('lvm.cluster.wizard.lv_create.success'), color: 'green' })
      emit('close')
    }
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
