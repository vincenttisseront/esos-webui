<template>
  <UCard>
    <template #header>
      <h3 class="text-sm font-medium">{{ t('storage.fs.chain.title') }}</h3>
    </template>
    <div class="flex flex-wrap items-stretch gap-2">
      <template v-for="(step, index) in steps" :key="step.id">
        <div
          class="flex-1 min-w-[8.5rem] rounded-lg border px-3 py-2 text-xs"
          :class="stepCardClass(step.status)"
        >
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-medium">{{ stepLabel(step.id) }}</span>
            <UBadge :color="badgeColor(step.status)" variant="soft" size="xs" :label="statusLabel(step.status)" />
          </div>
          <p class="font-mono text-[11px] truncate" :title="stepDetailText(step)">
            {{ stepDetailText(step) }}
          </p>
          <p v-if="step.hintKey" class="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
            {{ t(step.hintKey, step.messageParams ?? {}) }}
          </p>
        </div>
        <span v-if="index < steps.length - 1" class="hidden sm:flex items-center text-gray-400">→</span>
      </template>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { ProvisioningStepStatus, ProvisioningStepView } from '~/utils/lvm-provisioning-chain'

defineProps<{ steps: ProvisioningStepView[] }>()
const { t } = useEsosI18n()

const labels: Record<string, string> = {
  filesystem: 'storage.fs.chain.step.filesystem',
  vdisk: 'storage.fs.chain.step.vdisk',
  fileio: 'storage.fs.chain.step.fileio',
  expose: 'storage.fs.chain.step.expose',
}

function stepLabel(id: string) {
  const key = labels[id]
  return key ? t(key) : id
}

function stepDetailText(step: ProvisioningStepView): string {
  if (step.detailKey) {
    return t(step.detailKey, step.detailParams ?? {}) as string
  }
  return step.detail
}

function statusLabel(s: ProvisioningStepStatus) {
  return t(`storage.fs.chain.status.${s}`)
}

function badgeColor(s: ProvisioningStepStatus) {
  if (s === 'created') return 'green'
  if (s === 'optional') return 'gray'
  if (s === 'next' || s === 'ready') return 'primary'
  if (s === 'blocked') return 'red'
  return 'gray'
}

function stepCardClass(s: ProvisioningStepStatus) {
  if (s === 'created') return 'border-green-200 dark:border-green-900'
  if (s === 'optional') return 'border-gray-200 dark:border-gray-700 opacity-80'
  if (s === 'next') return 'border-primary-300 dark:border-primary-800'
  if (s === 'blocked') return 'border-red-200 dark:border-red-900'
  return 'border-gray-200 dark:border-gray-700'
}
</script>
