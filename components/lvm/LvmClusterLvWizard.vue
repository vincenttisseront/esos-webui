<template>
  <UModal v-model="open">
    <UCard class="max-w-2xl">
      <template #header>{{ t('lvm.cluster.wizard.lv_create.title') }}</template>
      <div class="space-y-4">
        <template v-if="step === 1">
          <UFormGroup :label="t('lvm.wizard.lv_create.vg')">
            <USelect v-model="selectedVg" :items="vgOptions" value-attribute="value" option-attribute="label" />
          </UFormGroup>
          <UFormGroup :label="t('lvm.wizard.lv_create.name')">
            <UInput v-model="lvName" placeholder="lv0" />
          </UFormGroup>
          <UFormGroup :label="t('lvm.wizard.lv_create.size_gib')">
            <UInput v-model.number="sizeGib" type="number" min="1" step="1" />
          </UFormGroup>
          <p v-if="selectedVgFree" class="text-xs text-gray-500">
            {{ t('lvm.wizard.lv_create.free', { size: formatBytes(selectedVgFree) }) }}
          </p>
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
              :disabled="step === 1 && (!selectedVg || !lvName || sizeGib < 1)"
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
              {{ t('lvm.cluster.wizard.lv_create.execute') }}
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
const selectedVg = ref('')
const lvName = ref('')
const sizeGib = ref(10)
const confirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterLvCreate>> | null>(null)
const planLoading = ref(false)
const planError = ref<string | null>(null)
const busy = ref(false)

const vgOptions = computed(() =>
  lvm.vgs.filter(v => !v.clustered).map(v => ({ value: v.name, label: `${v.name} (${formatBytes(v.freeBytes)} free)` })),
)
const selectedVgFree = computed(() => lvm.vgs.find(v => v.name === selectedVg.value)?.freeBytes ?? 0)

watch(open, (v) => {
  if (v) {
    step.value = 1
    selectedVg.value = vgOptions.value[0]?.value ?? ''
    lvm.setClusterContext(props.clusterId, props.sanId)
  }
})

function formatBytes(n: number) {
  if (!n) return '0 B'
  const u = ['B', 'KiB', 'MiB', 'GiB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${u[i]}`
}

async function loadPlan() {
  planLoading.value = true
  planError.value = null
  try {
    plan.value = await lvm.planClusterLvCreate({
      vgName: selectedVg.value,
      name: lvName.value,
      sizeBytes: Math.floor(sizeGib.value * 1024 ** 3),
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
  step.value = 3
}

async function execute() {
  if (!plan.value) return
  busy.value = true
  try {
    await lvm.executeClusterLvCreate({
      vgName: selectedVg.value,
      name: lvName.value,
      sizeBytes: Math.floor(sizeGib.value * 1024 ** 3),
      confirmation: confirmation.value,
      clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId },
    })
    toast.add({ title: t('lvm.cluster.wizard.lv_create.success'), color: 'green' })
    open.value = false
    emit('done')
  } catch (e: any) {
    toast.add({ title: e?.statusMessage ?? 'Erreur', color: 'red' })
  } finally {
    busy.value = false
  }
}
</script>
