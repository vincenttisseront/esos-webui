<template>
  <UModal v-model="open">
    <UCard class="max-w-2xl">
      <template #header>{{ t('lvm.cluster.wizard.vg_create.title') }}</template>
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
        <template v-else>
          <UFormGroup :label="t('lvm.confirm.label')">
            <UInput v-model="confirmation" :placeholder="plan?.confirmationPhrase" />
          </UFormGroup>
        </template>
      </div>
      <template #footer>
        <div class="flex justify-between">
          <UButton v-if="step > 1" color="gray" variant="ghost" @click="step--">{{ t('lvm.cluster.wizard.back') }}</UButton>
          <span v-else />
          <div class="flex gap-2">
            <UButton color="gray" variant="ghost" @click="open = false">{{ t('lvm.wizard.cancel') }}</UButton>
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
              v-else
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
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; sanId: string; clusterId: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
const step = ref(1)
const vgName = ref('')
const selectedPvs = ref<string[]>([])
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterVgCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)

watch(open, (v) => {
  if (v) {
    step.value = 1
    plan.value = null
    vgName.value = ''
    selectedPvs.value = lvm.orphanPvs.map(p => p.path)
    lvm.setClusterContext(props.clusterId, props.sanId)
  }
})

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
  step.value = 3
}

async function execute() {
  if (!plan.value) return
  busy.value = true
  try {
    await lvm.executeClusterVgCreate({
      name: vgName.value,
      pvPaths: selectedPvs.value,
      confirmation: confirmation.value,
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: lvm.lastDiskMappings,
      },
    })
    toast.add({ title: t('lvm.cluster.wizard.vg_create.success'), color: 'green' })
    open.value = false
    emit('done')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
