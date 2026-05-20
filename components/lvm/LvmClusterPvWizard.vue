<template>
  <UModal v-model="open">
    <UCard class="max-w-2xl">
      <template #header>{{ t('lvm.cluster.wizard.pv_create.title') }}</template>
      <div class="space-y-4">
        <template v-if="step === 1">
          <UFormGroup :label="t('lvm.wizard.pv_create.device')">
            <USelect v-model="selectedPath" :items="deviceOptions" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UCheckbox v-model="force" :label="t('lvm.wizard.pv_create.force')" />
        </template>
        <template v-else-if="step === 2">
          <p class="text-sm text-gray-500">{{ t('lvm.cluster.wizard.pv_create.mapping') }}</p>
          <LvmClusterPlanReview v-if="plan" :plan="plan" />
          <p v-else-if="planLoading" class="text-sm text-gray-500">{{ t('lvm.cluster.wizard.plan_loading') }}</p>
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
              :disabled="step === 1 && !selectedPath"
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
              {{ t('lvm.cluster.wizard.pv_create.execute') }}
            </UButton>
          </div>
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  sanId: string
  clusterId: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; done: [] }>()
const { t } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const open = computed({
  get: () => props.modelValue,
  set: v => emit('update:modelValue', v),
})
const step = ref(1)
const selectedPath = ref('')
const force = ref(false)
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterPvCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)

const deviceOptions = computed(() =>
  lvm.candidates.map(c => ({
    value: c.path,
    label: c.eligible ? c.path : `${c.path} (${c.reasons[0] ?? 'ineligible'})`,
    disabled: !c.eligible && !force.value,
  })),
)

watch(open, (v) => {
  if (v) {
    step.value = 1
    plan.value = null
    planError.value = null
    confirmation.value = ''
    selectedPath.value = lvm.candidates.find(c => c.eligible)?.path ?? ''
    lvm.setClusterContext(props.clusterId, props.sanId)
  }
})

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
        diskMappings: lvm.lastDiskMappings,
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
    await loadPlan()
    if (!plan.value?.okSymmetric) return
    step.value = 2
    return
  }
  if (step.value === 2) step.value = 3
}

async function execute() {
  if (!plan.value || !selectedPath.value) return
  busy.value = true
  try {
    await lvm.executeClusterPvCreate({
      path: selectedPath.value,
      force: force.value,
      confirmation: confirmation.value,
      clusterExecution: {
        primarySanId: props.sanId,
        clusterId: props.clusterId,
        diskMappings: lvm.lastDiskMappings,
      },
    })
    toast.add({ title: t('lvm.cluster.wizard.pv_create.success'), color: 'green' })
    open.value = false
    emit('done')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
