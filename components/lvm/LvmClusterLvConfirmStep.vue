<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
        {{ t('lvm.cluster.wizard.lv_create.confirm.title', { lvName }) }}
      </h3>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {{ t('lvm.cluster.wizard.lv_create.confirm.summary', { vgName }) }}
      </p>
    </div>

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/50 px-3 py-3">
      <div>
        <dt class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {{ t('lvm.cluster.wizard.lv_create.confirm.param_vg') }}
        </dt>
        <dd class="font-mono font-medium text-gray-900 dark:text-gray-100">{{ vgName }}</dd>
      </div>
      <div>
        <dt class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {{ t('lvm.cluster.wizard.lv_create.confirm.param_lv') }}
        </dt>
        <dd class="font-mono font-medium text-gray-900 dark:text-gray-100">{{ lvName }}</dd>
      </div>
      <div>
        <dt class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {{ t('lvm.cluster.wizard.lv_create.confirm.param_size') }}
        </dt>
        <dd class="font-mono font-medium text-gray-900 dark:text-gray-100">{{ sizeLabel }}</dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {{ t('lvm.cluster.wizard.lv_create.confirm.param_nodes') }}
        </dt>
        <dd class="text-gray-900 dark:text-gray-100">{{ targetNodesLabel }}</dd>
      </div>
    </dl>

    <div>
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
        {{ t('lvm.cluster.wizard.lv_create.confirm.commands_title') }}
      </p>
      <div class="space-y-1 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
        <div
          v-for="row in commandRows"
          :key="row.sanId"
          class="font-mono text-xs text-gray-800 dark:text-gray-200"
        >
          <span class="font-semibold text-gray-600 dark:text-gray-400">{{ row.label }}:</span>
          {{ row.command }}
        </div>
        <p v-if="!commandRows.length" class="text-xs text-gray-500 dark:text-gray-400">—</p>
      </div>
    </div>

    <div>
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
        {{ t('lvm.cluster.wizard.lv_create.confirm.checks_title') }}
      </p>
      <ul class="space-y-1.5 text-sm">
        <li
          v-for="check in checks"
          :key="check.id"
          class="flex gap-2 items-start"
        >
          <UIcon
            :name="check.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
            class="w-4 h-4 shrink-0 mt-0.5"
            :class="check.ok ? 'text-green-600' : 'text-red-600'"
          />
          <div>
            <span :class="check.ok ? 'text-gray-800 dark:text-gray-200' : 'text-red-700 dark:text-red-300'">
              {{ t(`lvm.cluster.wizard.lv_create.confirm.check_${check.id}`) }}
            </span>
            <p v-if="check.detail" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono break-all">
              {{ check.detail }}
            </p>
          </div>
        </li>
      </ul>
    </div>

    <UAlert
      v-if="lvExistsBlockers.length"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('lvm.cluster.wizard.lv_create.confirm.lv_exists_title')"
      :description="lvExistsBlockers.join(' · ')"
    />

    <UAlert
      v-if="plan && !plan.okSymmetric"
      color="red"
      variant="soft"
      :title="plan.blockers.join(' · ') || t('lvm.cluster.wizard.plan_invalid')"
    />

    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <p class="text-xs text-gray-600 dark:text-gray-400">
        {{ t('lvm.cluster.wizard.lv_create.confirm.phrase_help', { phrase: confirmationPhrase }) }}
      </p>
      <p class="font-mono text-sm font-semibold text-primary-700 dark:text-primary-300 select-all">
        {{ confirmationPhrase }}
      </p>
      <UFormGroup :label="t('lvm.confirm.label')">
        <UInput
          v-model="confirmationModel"
          :placeholder="confirmationPhrase"
          class="font-mono"
        />
      </UFormGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterLvmExecutionPlan, ClusterLvmPreflightResult } from '~/types/lvm'
import {
  buildClusterLvConfirmChecks,
  clusterLvConfirmBlocked,
  extractLvExistsBlockers,
} from '~/utils/lvm-cluster-lv-confirm'
import { formatLvSizeGibLabel } from '~/utils/lvm-lv-wizard-ui'

const props = defineProps<{
  vgName: string
  lvName: string
  sizeGib: number
  targetNodeLabels: string[]
  preflight: ClusterLvmPreflightResult | null
  plan: ClusterLvmExecutionPlan | null
  confirmation: string
}>()

const emit = defineEmits<{ 'update:confirmation': [string] }>()

const { t } = useEsosI18n()

const confirmationModel = computed({
  get: () => props.confirmation,
  set: v => emit('update:confirmation', v),
})

const confirmationPhrase = computed(() => props.plan?.confirmationPhrase ?? '')

const sizeLabel = computed(() => formatLvSizeGibLabel(props.sizeGib) || '—')

const targetNodesLabel = computed(() =>
  props.targetNodeLabels.length ? props.targetNodeLabels.join(', ') : '—',
)

const commandRows = computed(() =>
  (props.plan?.nodeResults ?? [])
    .filter(n => n.command)
    .map(n => ({ sanId: n.sanId, label: n.label, command: n.command! })),
)

const checks = computed(() =>
  buildClusterLvConfirmChecks({
    vgName: props.vgName,
    lvName: props.lvName,
    sizeBytes: Math.floor(Number(props.sizeGib) * 1024 ** 3),
    preflight: props.preflight,
    plan: props.plan,
  }),
)

const lvExistsBlockers = computed(() =>
  extractLvExistsBlockers([
    ...(props.preflight?.blockers ?? []),
    ...(props.plan?.blockers ?? []),
  ]),
)

const canExecute = computed(() =>
  confirmationPhrase.value
  && confirmationModel.value === confirmationPhrase.value
  && !clusterLvConfirmBlocked(checks.value, props.plan),
)

defineExpose({ canExecute })
</script>
