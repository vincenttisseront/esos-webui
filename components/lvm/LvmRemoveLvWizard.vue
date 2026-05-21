<template>
  <LvmWizardModalShell :title="t('lvm.remove.lv.title')" :step="step" :total-steps="2" icon="i-heroicons-trash">
    <div v-if="loading" class="text-sm text-gray-500 dark:text-gray-400 py-6">{{ t('lvm.remove.preflight_loading') }}</div>
    <div v-else-if="step === 1" class="space-y-4">
      <UAlert color="red" variant="soft" :title="t('lvm.remove.destructive_warning')" />
      <p class="text-sm">{{ t('lvm.remove.lv.intro', { vg: vgName, name: lvName }) }}</p>
      <div class="font-mono text-xs space-y-1 p-3 border rounded bg-gray-50 dark:bg-gray-900">
        <div v-for="row in commandRows" :key="row.label">{{ row.label }}: {{ row.command }}</div>
        <div v-if="standalonePreview">{{ standalonePreview }}</div>
      </div>
      <UAlert v-if="blockers.length" color="red" variant="soft" :title="blockers.join(' · ')" />
      <p class="font-mono text-sm font-semibold text-red-700 dark:text-red-300">{{ confirmationPhrase }}</p>
      <UFormGroup :label="t('lvm.confirm.label')">
        <UInput v-model="confirmation" class="font-mono" />
      </UFormGroup>
    </div>
    <LvmClusterExecutionResults v-else-if="executionResult" :result="executionResult" />
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="onCancel">{{ step === 2 ? t('lvm.cluster.wizard.close') : t('lvm.wizard.cancel') }}</UButton>
        <UButton v-if="step === 1" color="red" :loading="busy" :disabled="!canExecute" @click="execute">{{ t('lvm.remove.lv.execute') }}</UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
const props = defineProps<{ sanId: string; vgName: string; lvName: string; isClustered?: boolean; clusterId?: string }>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t, tError } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()
const step = ref(1)
const loading = ref(true)
const busy = ref(false)
const confirmation = ref('')
const blockers = ref<string[]>([])
const standalonePreview = ref('')
const requiredConfirmation = ref('')
const plan = ref<Awaited<ReturnType<typeof lvm.planClusterLvRemove>> | null>(null)
const executionResult = ref<Awaited<ReturnType<typeof lvm.executeClusterLvRemove>> | null>(null)
const confirmationPhrase = computed(() => plan.value?.confirmationPhrase ?? requiredConfirmation.value)
const commandRows = computed(() => (plan.value?.nodeResults ?? []).filter(n => n.command).map(n => ({ label: n.label, command: n.command! })))
const canExecute = computed(() => confirmation.value === confirmationPhrase.value && !blockers.value.length && (props.isClustered ? !!plan.value?.okSymmetric : true))

onMounted(() => { lvm.setSanId(props.sanId); void loadPreflight() })

async function loadPreflight() {
  loading.value = true
  try {
    if (props.isClustered && props.clusterId) {
      plan.value = await lvm.planClusterLvRemove({ vgName: props.vgName, name: props.lvName, confirmation: '', clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId } })
      blockers.value = plan.value.blockers
    } else {
      const pre = await lvm.preflight({ action: 'lvremove', payload: { vgName: props.vgName, name: props.lvName, confirmation: '' } })
      blockers.value = pre.blockers
      requiredConfirmation.value = pre.requiredConfirmation
      standalonePreview.value = pre.commandPreview ?? `lvremove -y -f ${props.vgName}/${props.lvName}`
    }
  } catch (e: unknown) {
    blockers.value = [tError(e as object, t('lvm.remove.preflight_failed'))]
  } finally { loading.value = false }
}

function onCancel() { step.value === 2 ? emit('close') : emit('cancel') }

async function execute() {
  if (!canExecute.value) return
  busy.value = true
  try {
    if (props.isClustered && props.clusterId && plan.value) {
      executionResult.value = await lvm.executeClusterLvRemove({ vgName: props.vgName, name: props.lvName, confirmation: confirmation.value.trim(), clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId } })
      step.value = 2
      if (executionResult.value.success) { toast.success(t('lvm.lv.removed')); emit('close') }
      else toast.error(t('lvm.remove.partial_failure'), executionResult.value.errors.join(' · '))
    } else {
      await lvm.removeLv({ vgName: props.vgName, name: props.lvName, confirmation: confirmation.value.trim() })
      toast.success(t('lvm.lv.removed'))
      emit('close')
    }
  } catch (e: unknown) {
    toast.error(t('lvm.remove.execute_failed'), tError(e as object))
  } finally { busy.value = false }
}
</script>
