<template>
  <div v-if="devices.length">
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Périphériques PCI notables</h3>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-100 dark:border-gray-800">
          <tr class="text-xs font-medium text-gray-400 uppercase tracking-wide">
            <th class="text-left py-2 pr-4">Slot</th>
            <th class="text-left py-2 pr-4">Fabricant</th>
            <th class="text-left py-2 pr-4">Périphérique</th>
            <th class="text-left py-2">Classe</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <tr
            v-for="d in devices"
            :key="d.slot"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/30"
          >
            <td class="py-2 pr-4 font-mono text-xs text-gray-500">{{ d.slot }}</td>
            <td class="py-2 pr-4 text-xs">{{ d.vendor }}</td>
            <td class="py-2 pr-4 text-xs">{{ d.device }}</td>
            <td class="py-2 text-xs text-gray-400">{{ d.class }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PCIDevice } from '~/server/utils/types'

defineProps<{ devices: PCIDevice[] }>()
</script>
