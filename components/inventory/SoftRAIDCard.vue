<template>
  <div v-if="raids.length">
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">RAID logiciel (md)</h3>
    <div class="space-y-3">
      <div
        v-for="r in raids"
        :key="r.device"
        class="rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold font-mono text-gray-800">{{ r.device }}</span>
          <div class="flex items-center gap-2">
            <UBadge :color="r.state === 'active' ? 'green' : 'red'" size="xs" variant="subtle">{{ r.state }}</UBadge>
            <span class="text-xs text-gray-400">{{ r.level }}</span>
          </div>
        </div>

        <!-- Members -->
        <div class="flex flex-wrap gap-2">
          <span
            v-for="m in r.members"
            :key="m.disk"
            :class="[
              'text-xs px-2 py-0.5 rounded font-mono',
              m.state === 'active' ? 'bg-green-50 text-green-700' :
              m.state === 'faulty' ? 'bg-red-50 text-red-700' :
              'bg-yellow-50 text-yellow-700'
            ]"
          >
            {{ m.disk }}
            <span v-if="m.state !== 'active'" class="ml-1 opacity-60">({{ m.state }})</span>
          </span>
        </div>

        <!-- Resync progress -->
        <div v-if="r.resync" class="mt-2">
          <div class="flex justify-between text-xs text-gray-500 mb-0.5">
            <span>{{ r.resync.action }} en cours</span>
            <span>{{ r.resync.speed }}</span>
          </div>
          <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div class="h-full bg-blue-400 rounded-full" :style="{ width: `${r.resync.pct}%` }" />
          </div>
          <p class="text-right text-[10px] text-gray-400 mt-0.5">{{ r.resync.pct.toFixed(1) }}%</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SoftRAID } from '~/server/utils/types'

defineProps<{ raids: SoftRAID[] }>()
</script>
