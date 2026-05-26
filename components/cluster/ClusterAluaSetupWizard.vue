<template>
  <UModal v-model="open" :ui="{ width: 'max-w-3xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">{{ t('cluster.alua.wizard.title') }}</h3>
          <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" size="xs" @click="close" />
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ stepLabel }}</p>
      </template>

      <UAlert
        v-if="inventory && inventory.nodeCount !== 2"
        color="amber"
        variant="soft"
        class="mb-4"
        :title="t('cluster.alua.wizard.two_node_banner', { count: inventory.nodeCount })"
      />

      <div v-if="step === 0">
        <div v-if="preflightLoading" class="text-sm text-gray-500">{{ t('common.loading') }}</div>
        <ul v-else class="space-y-1 text-sm">
          <li v-for="(b, i) in preflight?.blockers ?? []" :key="'b'+i" class="text-red-600">
            {{ t(b.messageKey, b.messageParams ?? {}) }}
          </li>
          <li v-for="(w, i) in preflight?.warnings ?? []" :key="'w'+i" class="text-amber-600">
            {{ t(w.messageKey, w.messageParams ?? {}) }}
          </li>
          <li v-if="preflight?.ok" class="text-green-600">OK</li>
        </ul>
      </div>

      <div v-else-if="step === 1 && inventory" class="space-y-2">
        <p class="text-xs text-gray-500">{{ t('cluster.alua.wizard.steps.devices') }}</p>
        <div v-for="dev in allDevices" :key="dev" class="flex items-center gap-2">
          <UCheckbox :model-value="form.deviceNames.includes(dev)" @update:model-value="toggleDevice(dev, $event)" />
          <span class="font-mono text-sm">{{ dev }}</span>
        </div>
      </div>

      <div v-else-if="step === 2" class="space-y-3">
        <UFormGroup :label="t('cluster.alua.wizard.device_group_name')">
          <UInput v-model="form.deviceGroupName" />
        </UFormGroup>
        <USelectMenu
          v-model="form.mode"
          :options="modeOptions"
          value-attribute="value"
          option-attribute="label"
        />
      </div>

      <div v-else-if="step === 3" class="grid grid-cols-2 gap-3">
        <UFormGroup :label="t('cluster.alua.role.local')">
          <UInput v-model="form.targetGroupNames.local" />
        </UFormGroup>
        <UFormGroup :label="t('cluster.alua.role.remote')">
          <UInput v-model="form.targetGroupNames.remote" />
        </UFormGroup>
        <UFormGroup :label="t('cluster.alua.wizard.group_id_local')">
          <UInput v-model.number="form.groupIdsOnPrimary.local" type="number" min="1" />
        </UFormGroup>
        <UFormGroup :label="t('cluster.alua.wizard.group_id_remote')">
          <UInput v-model.number="form.groupIdsOnPrimary.remote" type="number" min="1" />
        </UFormGroup>
      </div>

      <div v-else-if="step === 4 && inventory" class="space-y-2">
        <p class="text-xs text-gray-500">{{ t('cluster.alua.wizard.assignments_help') }}</p>
        <div
          v-for="node in inventory.nodes"
          :key="node.nodeId"
          class="rounded border border-gray-200 dark:border-gray-700 p-2"
        >
          <p class="text-xs font-medium mb-1">{{ node.hostname }}</p>
          <div v-for="tgt in node.targets" :key="tgt" class="flex items-center gap-2 text-xs">
            <span class="font-mono flex-1 truncate">{{ tgt }}</span>
            <USelectMenu
              :model-value="assignmentRole(node.nodeId, tgt)"
              :options="roleOptions"
              value-attribute="value"
              option-attribute="label"
              size="xs"
              @update:model-value="setAssignment(node.nodeId, tgt, $event)"
            />
          </div>
        </div>
      </div>

      <div v-else-if="step === 5 && plan" class="space-y-3 max-h-64 overflow-y-auto">
        <p class="text-xs font-medium">{{ t('cluster.alua.wizard.plan_summary') }}</p>
        <div v-for="np in plan.nodes" :key="np.nodeId" class="rounded border p-2 text-xs font-mono">
          <p class="font-sans font-medium mb-1">{{ np.hostname }}</p>
          <pre class="whitespace-pre-wrap text-[10px]">{{ np.configPatchSummary.join('\n') }}</pre>
        </div>
      </div>

      <div v-else-if="step === 6" class="space-y-3">
        <UCheckbox v-model="reloadAck" :label="t('cluster.alua.wizard.reload_ack')" />
        <p class="text-xs text-gray-500">{{ t('cluster.alua.wizard.phrase_help', { phrase: confirmationPhrase }) }}</p>
        <UInput v-model="confirmation" class="font-mono" :placeholder="confirmationPhrase" />
      </div>

      <template #footer>
        <div class="flex justify-between w-full">
          <UButton color="gray" variant="ghost" :label="step === 0 ? t('common.actions.cancel') : t('cluster.wizard.prev')" @click="prev" />
          <UButton
            v-if="step < 6"
            color="primary"
            :label="t('cluster.wizard.next')"
            :disabled="!canNext"
            :loading="planLoading"
            @click="next"
          />
          <UButton
            v-else
            color="primary"
            :label="t('cluster.alua.wizard.submit')"
            :disabled="!canSubmit"
            :loading="executeLoading"
            @click="execute"
          />
        </div>
      </template>
    </UCard>
  </UModal>
</template>

<script setup lang="ts">
import type {
  AluaClusterPlan,
  AluaWizardAssignment,
  AluaWizardInventory,
  AluaWizardPreflightResult,
  AluaWizardRequest,
  AluaWizardTargetRole,
} from '~/types/alua'

const props = defineProps<{
  modelValue: boolean
  clusterId: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'applied'): void
}>()

const { t } = useEsosI18n()
const toast = useAppToast()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const step = ref(0)
const stepLabels = computed(() => [
  t('cluster.alua.wizard.steps.preflight'),
  t('cluster.alua.wizard.steps.devices'),
  t('cluster.alua.wizard.steps.device_group'),
  t('cluster.alua.wizard.steps.target_groups'),
  t('cluster.alua.wizard.steps.assignments'),
  t('cluster.alua.wizard.steps.preview'),
  t('cluster.alua.wizard.steps.confirm'),
])
const stepLabel = computed(() => stepLabels.value[step.value] ?? '')

const inventory = ref<AluaWizardInventory | null>(null)
const preflight = ref<AluaWizardPreflightResult | null>(null)
const plan = ref<AluaClusterPlan | null>(null)
const preflightLoading = ref(false)
const planLoading = ref(false)
const executeLoading = ref(false)
const reloadAck = ref(false)
const confirmation = ref('')
const confirmationPhrase = 'CONFIGURE ALUA'

const form = reactive<AluaWizardRequest>({
  clusterId:        props.clusterId,
  deviceGroupName:  'esos',
  deviceNames:      [],
  targetGroupNames: { local: 'local', remote: 'remote' },
  groupIdsOnPrimary: { local: 1, remote: 2 },
  assignments:      [],
  mode:             'create',
})

watch(() => props.clusterId, (id) => { form.clusterId = id })

const allDevices = computed(() => {
  if (!inventory.value) return []
  const s = new Set<string>()
  for (const n of inventory.value.nodes) {
    for (const d of n.devices) s.add(d)
  }
  return [...s].sort()
})

const roleOptions = computed(() => [
  { label: t('cluster.alua.role.local'), value: 'local' },
  { label: t('cluster.alua.role.remote'), value: 'remote' },
])

const modeOptions = computed(() => [
  { label: t('cluster.alua.wizard.mode_create'), value: 'create' },
  { label: t('cluster.alua.wizard.mode_replace'), value: 'replace' },
])

function toggleDevice(dev: string, checked: boolean) {
  if (checked) {
    if (!form.deviceNames.includes(dev)) form.deviceNames.push(dev)
  } else {
    form.deviceNames = form.deviceNames.filter(d => d !== dev)
  }
}

function assignmentRole(nodeId: string, targetName: string): AluaWizardTargetRole {
  return form.assignments.find(a => a.nodeId === nodeId && a.targetName === targetName)?.role ?? 'local'
}

function setAssignment(nodeId: string, targetName: string, role: AluaWizardTargetRole) {
  const idx = form.assignments.findIndex(a => a.nodeId === nodeId && a.targetName === targetName)
  if (idx >= 0) form.assignments[idx]!.role = role
  else form.assignments.push({ nodeId, targetName, role })
}

async function loadInventory() {
  inventory.value = await $fetch<AluaWizardInventory>('/api/cluster/alua/wizard/inventory', {
    query: { clusterId: props.clusterId },
  })
  if (inventory.value.nodes[0]?.suggestedAssignments.length) {
    form.assignments = [...inventory.value.nodes[0].suggestedAssignments]
  }
  const primary = inventory.value.nodes.find(n => n.targets.length > 0)
  if (primary && !form.primaryNodeId) form.primaryNodeId = primary.nodeId
}

async function runPreflight() {
  preflightLoading.value = true
  try {
    preflight.value = await $fetch<AluaWizardPreflightResult>('/api/cluster/alua/preflight', {
      method: 'POST',
      body: { ...form },
    })
  } finally {
    preflightLoading.value = false
  }
}

async function buildPlan() {
  planLoading.value = true
  try {
    plan.value = await $fetch<AluaClusterPlan>('/api/cluster/alua/plan', {
      method: 'POST',
      body: { ...form },
    })
  } catch (err: any) {
    toast.error(err?.data?.message ?? err?.message ?? 'Plan failed')
    throw err
  } finally {
    planLoading.value = false
  }
}

const canNext = computed(() => {
  if (step.value === 0) return preflight.value?.ok
  if (step.value === 1) return form.deviceNames.length > 0
  if (step.value === 2) return form.deviceGroupName.trim().length > 0
  if (step.value === 4) return form.assignments.length > 0
  return true
})

const canSubmit = computed(() =>
  reloadAck.value
  && confirmation.value === confirmationPhrase
  && Boolean(plan.value?.planToken),
)

async function next() {
  if (step.value === 0) await runPreflight()
  if (step.value === 4) await buildPlan()
  if (step.value < 6) step.value++
}

function prev() {
  if (step.value === 0) close()
  else step.value--
}

function close() {
  open.value = false
  step.value = 0
  plan.value = null
}

async function execute() {
  if (!plan.value?.planToken) return
  executeLoading.value = true
  try {
    await $fetch('/api/cluster/alua/execute', {
      method: 'POST',
      body: {
        planToken: plan.value.planToken,
        confirmation: confirmation.value,
      },
    })
    toast.success(t('cluster.alua.wizard.success'))
    emit('applied')
    close()
  } catch (err: any) {
    toast.error(err?.data?.message ?? err?.message ?? t('common.failure'))
  } finally {
    executeLoading.value = false
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    form.clusterId = props.clusterId
    await loadInventory()
    await runPreflight()
  }
})
</script>
