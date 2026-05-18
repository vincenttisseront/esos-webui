<template>
  <button
    v-if="hw.hasAlerts"
    class="relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition hover:opacity-80"
    :class="hw.criticalAlerts.length > 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'"
    @click="navigateTo('/hardware')"
  >
    <span>{{ hw.alertCount }}</span>
    <span>{{ hw.criticalAlerts.length > 0 ? '🔴' : '⚠️' }}</span>
  </button>
</template>

<script setup lang="ts">
import { useHardwareStore } from '~/stores/hardware'

const hw = useHardwareStore()
</script>
