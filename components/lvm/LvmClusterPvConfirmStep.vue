<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-3 space-y-2 text-sm text-amber-950 dark:text-amber-100">
      <p>{{ t('lvm.cluster.wizard.pv_create.confirm.intro') }}</p>
      <ul class="list-disc list-inside space-y-1 text-xs">
        <li>{{ t('lvm.cluster.wizard.pv_create.confirm.bullet_init') }}</li>
        <li>{{ t('lvm.cluster.wizard.pv_create.confirm.bullet_cluster') }}</li>
        <li>{{ t('lvm.cluster.wizard.pv_create.confirm.bullet_metadata') }}</li>
      </ul>
    </div>

    <div>
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
        {{ t('lvm.cluster.wizard.pv_create.confirm.commands_title') }}
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
        <p v-if="!commandRows.length" class="text-xs text-gray-500">—</p>
      </div>
    </div>

    <div>
      <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
        {{ t('lvm.cluster.wizard.pv_create.confirm.checks_title') }}
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
              {{ t(`lvm.cluster.wizard.pv_create.confirm.check_${check.id}`) }}
            </span>
            <p v-if="check.detail" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono break-all">
              {{ check.detail }}
            </p>
          </div>
        </li>
      </ul>
    </div>

    <UAlert
      v-if="existingPvBlockers.length"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      :title="t('lvm.cluster.wizard.pv_create.confirm.pv_exists_title')"
      :description="existingPvBlockers.join(' · ')"
    />

    <UAlert
      v-if="plan && !plan.okSymmetric"
      color="red"
      variant="soft"
      :title="plan.blockers.join(' · ') || t('lvm.cluster.wizard.plan_invalid')"
    />

    <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
      <p class="text-xs text-gray-600 dark:text-gray-400">
        {{ t('lvm.cluster.wizard.pv_create.confirm.phrase_help') }}
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
import type {
  ClusterLvmDiskMapping,
  ClusterLvmExecutionPlan,
  ClusterLvmPreflightResult,
} from '~/types/lvm'
import {
  buildClusterPvConfirmChecks,
  clusterPvConfirmBlocked,
} from '~/utils/lvm-cluster-pv-confirm'

const props = defineProps<{
  primarySanId: string
  sourcePath: string
  force: boolean
  mappings: ClusterLvmDiskMapping[]
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

const commandRows = computed(() =>
  (props.plan?.nodeResults ?? [])
    .filter(n => n.command)
    .map(n => ({ sanId: n.sanId, label: n.label, command: n.command! })),
)

const checks = computed(() =>
  buildClusterPvConfirmChecks({
    primarySanId: props.primarySanId,
    sourcePath: props.sourcePath,
    force: props.force,
    mappings: props.mappings,
    preflight: props.preflight,
    plan: props.plan,
    labels: { force_acknowledged: t('lvm.cluster.wizard.pv_create.confirm.force_acknowledged') },
  }),
)

const existingPvBlockers = computed(() =>
  [
    ...(props.preflight?.blockers ?? []),
    ...(props.plan?.blockers ?? []),
  ].filter(b => /PV déjà présent|Déjà volume physique/i.test(b)),
)

const canExecute = computed(() =>
  confirmationPhrase.value
  && confirmationModel.value === confirmationPhrase.value
  && !clusterPvConfirmBlocked(checks.value, props.plan),
)

defineExpose({ canExecute })
</script>
