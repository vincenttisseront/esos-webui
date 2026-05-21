<template>
  <div
    class="rounded-lg border p-4 space-y-3"
    :class="levelBorderClass"
  >
    <div class="flex items-start justify-between gap-2">
      <div>
        <p class="font-semibold text-gray-900 dark:text-gray-100">{{ node.label }}</p>
        <p class="text-xs text-gray-500 dark:text-gray-400 font-mono">{{ node.sanId }}</p>
        <p v-if="node.installed.raw" class="text-xs text-gray-600 dark:text-gray-300 mt-1">
          {{ node.installed.raw }}
        </p>
      </div>
      <UBadge :color="levelBadgeColor" variant="subtle" size="sm">
        {{ t(`admin.upgrade.levels.${node.level}`) }}
      </UBadge>
    </div>

    <ul class="space-y-1.5 text-sm">
      <li
        v-for="check in node.checks"
        :key="check.id"
        class="flex items-start gap-2"
      >
        <UIcon
          :name="checkIcon(check)"
          class="w-4 h-4 shrink-0 mt-0.5"
          :class="checkIconClass(check)"
        />
        <div class="min-w-0">
          <span class="font-medium text-gray-800 dark:text-gray-200">
            {{ checkLabel(check.id) }}
          </span>
          <span class="text-gray-500 dark:text-gray-400 text-xs block">{{ check.detail }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import type { UpgradeNodeReadiness, UpgradeCheck } from '~/types/upgrade'

const props = defineProps<{ node: UpgradeNodeReadiness }>()
const { t } = useEsosI18n()

const levelBorderClass = computed(() => ({
  ready: 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20',
  blocked: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20',
}[props.node.level]))

const levelBadgeColor = computed(() => ({
  ready: 'green',
  warning: 'amber',
  blocked: 'red',
}[props.node.level] as 'green' | 'amber' | 'red'))

function checkLabel(id: string): string {
  const key = `admin.upgrade.checks.${id}`
  return t(key) !== key ? (t(key) as string) : id
}

function checkIcon(check: UpgradeCheck): string {
  if (check.ok && check.level === 'ready') return 'i-heroicons-check-circle'
  if (check.level === 'warning') return 'i-heroicons-exclamation-triangle'
  return 'i-heroicons-x-circle'
}

function checkIconClass(check: UpgradeCheck): string {
  if (check.ok && check.level !== 'blocked') return 'text-green-600 dark:text-green-400'
  if (check.level === 'warning') return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}
</script>
