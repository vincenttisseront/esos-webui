<template>
  <UCard>
    <template #header>
      <h3 class="text-sm font-medium">{{ t('lvm.provisioning.chain_title') }}</h3>
    </template>
    <div class="flex flex-wrap items-stretch gap-2">
      <template v-for="(step, index) in steps" :key="step.id">
        <div
          class="flex-1 min-w-[8.5rem] rounded-lg border px-3 py-2 text-xs"
          :class="stepCardClass(step.status)"
        >
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-medium text-gray-700 dark:text-gray-300">{{ stepLabel(step.id) }}</span>
            <UBadge :color="statusBadgeColor(step.status)" variant="soft" size="xs" :label="statusLabel(step.status)" />
          </div>
          <p class="font-mono text-[11px] truncate text-gray-800 dark:text-gray-200" :title="step.detail">
            {{ step.detail }}
          </p>
          <p v-if="step.clusterProgress" class="text-[10px] font-medium text-gray-600 dark:text-gray-400 mt-0.5">
            {{ step.clusterProgress.ready }}/{{ step.clusterProgress.total }}
          </p>
          <p v-else-if="step.count != null && step.count > 0" class="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
            ×{{ step.count }}
          </p>
          <p v-if="step.hintKey" class="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
            {{ t(step.hintKey) }}
          </p>
        </div>
        <span
          v-if="index < steps.length - 1"
          class="hidden sm:flex items-center text-gray-400 px-0.5"
          aria-hidden="true"
        >→</span>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ProvisioningStepId, ProvisioningStepStatus, ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

defineProps<{
  steps: ProvisioningStepView[]
}>()

const { t } = useEsosI18n()

const stepKeys: Record<ProvisioningStepId, string> = {
  source: 'lvm.provisioning.step.source',
  pv: 'lvm.provisioning.step.pv',
  vg: 'lvm.provisioning.step.vg',
  lv: 'lvm.provisioning.step.lv',
  scst: 'lvm.provisioning.step.scst',
}

const statusKeys: Record<ProvisioningStepStatus, string> = {
  ready: 'lvm.provisioning.status.ready',
  created: 'lvm.provisioning.status.created',
  missing: 'lvm.provisioning.status.missing',
  blocked: 'lvm.provisioning.status.blocked',
  next: 'lvm.provisioning.status.next',
  optional: 'lvm.provisioning.status.optional',
}

function stepLabel(id: ProvisioningStepId) {
  return t(stepKeys[id])
}

function statusLabel(status: ProvisioningStepStatus) {
  return t(statusKeys[status])
}

function statusBadgeColor(status: ProvisioningStepStatus): 'green' | 'amber' | 'red' | 'blue' | 'gray' {
  switch (status) {
    case 'created': return 'green'
    case 'next': return 'blue'
    case 'missing': return 'amber'
    case 'blocked': return 'red'
    case 'optional': return 'gray'
    default: return 'gray'
  }
}

function stepCardClass(status: ProvisioningStepStatus): string {
  switch (status) {
    case 'next':
      return 'border-primary-300 dark:border-primary-700 bg-primary-50/80 dark:bg-primary-950/40'
    case 'created':
      return 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20'
    case 'missing':
      return 'border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20'
    case 'blocked':
      return 'border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/20'
    default:
      return 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
  }
}
</script>
