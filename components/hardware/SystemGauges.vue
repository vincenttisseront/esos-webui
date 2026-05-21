<template>
  <UCard>
    <template #header>
      <span class="text-lg font-semibold">{{ t('hardware.systemGauges.cardTitle') }}</span>
    </template>

    <div class="space-y-5">
      <!-- CPU -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">{{ t('hardware.systemGauges.cpu') }}</span>
          <span :class="['text-sm font-semibold', cpuColor]">{{ props.info.cpuUsagePct }}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            :class="['h-2 rounded-full transition-all duration-500', cpuBarColor]"
            :style="{ width: `${props.info.cpuUsagePct}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {{ props.info.cpuModel }} — {{ t('hardware.systemGauges.cores', { n: props.info.cpuCores }) }}
          — {{ t('hardware.systemGauges.loadPrefix') }}: {{ props.info.loadAvg.map((v) => v.toFixed(2)).join(' / ') }}
        </p>
      </div>

      <!-- RAM -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">{{ t('hardware.systemGauges.memory') }}</span>
          <span :class="['text-sm font-semibold', ramColor]">{{ props.memory.usedPct }}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            :class="['h-2 rounded-full transition-all duration-500', ramBarColor]"
            :style="{ width: `${props.memory.usedPct}%` }"
          />
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {{
            t('hardware.systemGauges.ramLine', {
              used: formatKb(props.memory.usedKb),
              total: formatKb(props.memory.totalKb),
              available: formatKb(props.memory.availableKb),
            })
          }}
        </p>
      </div>

      <!-- Uptime + Hostname -->
      <div class="flex gap-6">
        <div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('hardware.systemGauges.host') }}</p>
          <p class="text-sm font-mono">{{ props.info.hostname }}</p>
        </div>
        <div>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ t('hardware.systemGauges.uptimeLabel') }}</p>
          <p class="text-sm">{{ formatUptime(props.info.uptime) }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { SystemInfo, MemoryInfo } from '~/server/utils/types'

const { t } = useEsosI18n()

const props = defineProps<{ info: SystemInfo; memory: MemoryInfo }>()

const cpuColor = computed(() => {
  if (props.info.cpuUsagePct >= 90) return 'text-red-500'
  if (props.info.cpuUsagePct >= 70) return 'text-yellow-500'
  return 'text-green-600'
})

const cpuBarColor = computed(() => {
  if (props.info.cpuUsagePct >= 90) return 'bg-red-500'
  if (props.info.cpuUsagePct >= 70) return 'bg-yellow-400'
  return 'bg-green-500'
})

const ramColor = computed(() => {
  if (props.memory.usedPct >= 95) return 'text-red-500'
  if (props.memory.usedPct >= 80) return 'text-yellow-500'
  return 'text-green-600'
})

const ramBarColor = computed(() => {
  if (props.memory.usedPct >= 95) return 'bg-red-500'
  if (props.memory.usedPct >= 80) return 'bg-yellow-400'
  return 'bg-teal-500'
})

function formatKb(kb: number): string {
  if (kb >= 1_048_576) return `${(kb / 1_048_576).toFixed(1)} GB`
  if (kb >= 1_024) return `${(kb / 1_024).toFixed(0)} MB`
  return `${kb} KB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return t('hardware.systemGauges.uptimeFormat.dhm', { d, h, m }) as string
  if (h > 0) return t('hardware.systemGauges.uptimeFormat.hm', { h, m }) as string
  return t('hardware.systemGauges.uptimeFormat.m', { m }) as string
}
</script>
