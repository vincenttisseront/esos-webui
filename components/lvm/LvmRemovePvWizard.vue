<template>
  <LvmWizardModalShell
    :title="t('lvm.remove.pv.title')"
    :step="step"
    :total-steps="2"
    icon="i-heroicons-trash"
  >
    <div v-if="loading" class="text-sm text-gray-500 flex items-center gap-2 py-6">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin w-4 h-4" />
      {{ t('lvm.remove.preflight_loading') }}
    </div>
    <div v-else-if="step === 1" class="space-y-4">
      <UAlert color="red" variant="soft" icon="i-heroicons-exclamation-triangle" :title="t('lvm.remove.destructive_warning')" />

      <p class="text-sm text-gray-700 dark:text-gray-300">{{ t('lvm.remove.pv.intro') }}</p>
      <p v-if="isClustered" class="text-sm text-gray-600 dark:text-gray-400">{{ t('lvm.remove.pv.cluster_intro') }}</p>

      <div>
        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
          {{ t('lvm.remove.commands_title') }}
        </p>
        <div class="space-y-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 font-mono text-xs">
          <div v-for="row in commandRows" :key="row.label">
            <span class="font-semibold text-gray-500">{{ row.label }}:</span> {{ row.command }}
          </div>
          <p v-if="!commandRows.length && standalonePreview">{{ standalonePreview }}</p>
        </div>
      </div>

      <UAlert v-if="blockers.length" color="red" variant="soft" :title="blockers.join(' · ')" />
      <UAlert v-if="warnings.length" color="amber" variant="soft" :title="warnings.join(' · ')" />

      <ul v-if="checks.length" class="text-sm space-y-1">
        <li v-for="c in checks" :key="c.id" class="flex gap-2">
          <UIcon
            :name="c.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            class="w-4 h-4 shrink-0"
            :class="c.ok ? 'text-green-600' : 'text-red-600'"
          />
          <span>{{ c.label }}</span>
        </li>
      </ul>

      <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <p class="text-xs text-gray-500">{{ t('lvm.remove.phrase_help') }}</p>
        <p class="font-mono text-sm font-semibold text-red-700 dark:text-red-300 select-all">{{ confirmationPhrase }}</p>
        <UFormGroup :label="t('lvm.confirm.label')">
          <UInput v-model="confirmation" class="font-mono" :placeholder="confirmationPhrase" />
        </UFormGroup>
      </div>
    </div>
    <template v-else>
      <LvmClusterExecutionResults v-if="executionResult" :result="executionResult" />
      <UAlert v-else color="green" variant="soft" :title="t('lvm.pv.removed')" />
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="gray" variant="ghost" @click="onCancel">{{ step === 2 ? t('lvm.cluster.wizard.close') : t('lvm.wizard.cancel') }}</UButton>
        <UButton
          v-if="step === 1"
          color="red"
          :loading="busy"
          :disabled="!canExecute"
          @click="execute"
        >
          {{ t('lvm.remove.pv.execute') }}
        </UButton>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionPlan, ClusterLvmExecutionResult } from '~/types/lvm'

const props = defineProps<{
  sanId: string
  path: string
  isClustered?: boolean
  clusterId?: string
}>()
const emit = defineEmits<{ cancel: []; close: [] }>()
const { t, tError } = useEsosI18n()
const lvm = useLvmStore()
const toast = useAppToast()

const step = ref(1)
const loading = ref(true)
const busy = ref(false)
const confirmation = ref('')
const blockers = ref<string[]>([])
const warnings = ref<string[]>([])
const standalonePreview = ref('')
const requiredConfirmation = ref('')
const plan = ref<ClusterLvmExecutionPlan | null>(null)
const executionResult = ref<ClusterLvmExecutionResult | null>(null)

const confirmationPhrase = computed(() =>
  plan.value?.confirmationPhrase ?? requiredConfirmation.value,
)

const commandRows = computed(() =>
  (plan.value?.nodeResults ?? [])
    .filter(n => n.command)
    .map(n => ({ label: n.label, command: n.command! })),
)

const checks = computed(() => {
  const list: { id: string; ok: boolean; label: string }[] = []
  const pv = lvm.pvs.find(p => p.path === props.path)
  list.push({
    id: 'exists',
    ok: !!pv,
    label: t('lvm.remove.pv.check_exists', { path: props.path }),
  })
  list.push({
    id: 'not_in_vg',
    ok: !pv?.vgName,
    label: pv?.vgName
      ? t('lvm.remove.pv.check_in_vg', { vg: pv.vgName })
      : t('lvm.remove.pv.check_not_in_vg'),
  })
  list.push({
    id: 'preflight',
    ok: blockers.value.length === 0 && (plan.value?.okSymmetric ?? !props.isClustered),
    label: t('lvm.remove.pv.check_preflight'),
  })
  return list
})

const canExecute = computed(() =>
  confirmationPhrase.value
  && confirmation.value === confirmationPhrase.value
  && blockers.value.length === 0
  && (props.isClustered ? !!plan.value?.okSymmetric : true),
)

onMounted(() => {
  lvm.setSanId(props.sanId)
  if (props.isClustered && props.clusterId) {
    lvm.setClusterContext(props.clusterId, props.sanId)
  }
  void loadPreflight()
})

async function loadPreflight() {
  loading.value = true
  blockers.value = []
  warnings.value = []
  try {
    if (props.isClustered && props.clusterId) {
      plan.value = await lvm.planClusterPvRemove({
        path: props.path,
        confirmation: '',
        clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId },
      })
      blockers.value = plan.value.blockers
      warnings.value = plan.value.warnings
    } else {
      const pre = await lvm.preflight({
        action: 'pvremove',
        payload: { path: props.path, confirmation: '' },
      })
      blockers.value = pre.blockers
      warnings.value = pre.warnings
      requiredConfirmation.value = pre.requiredConfirmation
      standalonePreview.value = pre.commandPreview ?? `pvremove -y -f ${props.path}`
    }
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { message?: string } }
    blockers.value = [tError(err, t('lvm.remove.preflight_failed'))]
  } finally {
    loading.value = false
  }
}

function onCancel() {
  if (step.value === 2) emit('close')
  else emit('cancel')
}

async function execute() {
  if (!canExecute.value) return
  busy.value = true
  try {
    if (props.isClustered && props.clusterId && plan.value) {
      executionResult.value = await lvm.executeClusterPvRemove({
        path: props.path,
        confirmation: confirmation.value.trim(),
        clusterExecution: { primarySanId: props.sanId, clusterId: props.clusterId },
      })
      step.value = 2
      if (executionResult.value.success) {
        toast.success(t('lvm.pv.removed'))
        emit('close')
      } else {
        toast.error(t('lvm.remove.partial_failure'), executionResult.value.errors.join(' · '))
      }
    } else {
      await lvm.removePv({ path: props.path, confirmation: confirmation.value.trim() })
      toast.success(t('lvm.pv.removed'))
      emit('close')
    }
  } catch (e: unknown) {
    const err = e as { statusMessage?: string; data?: { message?: string } }
    toast.error(t('lvm.remove.execute_failed'), tError(err))
  } finally {
    busy.value = false
  }
}
</script>
