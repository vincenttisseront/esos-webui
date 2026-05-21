<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <span class="text-lg font-semibold">{{ t('hardware.fcPortCard.title') }}</span>
        <UBadge :color="allOnline ? 'green' : 'red'" variant="soft" size="xs">
          {{ t('hardware.fcPortCard.onlineBadge', { online: onlineCount, total: ports.length }) }}
        </UBadge>
      </div>
    </template>

    <div v-if="ports.length === 0" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
      {{ t('hardware.fcPortCard.empty') }}
    </div>

    <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
      <div
        v-for="port in ports"
        :key="port.host"
        class="flex items-center justify-between py-3 first:pt-0 last:pb-0"
      >
        <!-- Indicateur d'état -->
        <div class="flex items-center gap-3">
          <span
            :class="[
              'inline-block h-2.5 w-2.5 rounded-full',
              port.portState === 'Online'
                ? 'bg-green-500'
                : 'bg-red-500 animate-pulse',
            ]"
          />
          <div>
            <p class="text-sm font-medium font-mono">{{ port.portName || port.host }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">{{ port.symbolicName || port.host }}</p>
          </div>
        </div>

        <!-- Détails -->
        <div class="text-right">
          <UBadge
            :color="port.portState === 'Online' ? 'green' : 'red'"
            variant="soft"
            size="xs"
            class="mb-1"
          >
            {{ port.portState }}
          </UBadge>
          <p class="text-xs text-gray-500 dark:text-gray-400">{{ port.speed }}</p>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import type { FCPort } from '~/server/utils/types'

const { t } = useEsosI18n()

const props = defineProps<{ ports: FCPort[] }>()

const onlineCount = computed(() => props.ports.filter((p) => p.portState === 'Online').length)
const allOnline = computed(() => onlineCount.value === props.ports.length && props.ports.length > 0)
</script>
