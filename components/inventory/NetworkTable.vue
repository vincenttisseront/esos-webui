<template>
  <div>
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Interfaces réseau</h3>

    <p v-if="!network.length" class="text-sm text-gray-400 italic">Aucune interface réseau détectée</p>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-100 dark:border-gray-800">
          <tr class="text-xs font-medium text-gray-400 uppercase tracking-wide">
            <th class="text-left py-2 pr-4">Interface</th>
            <th class="text-left py-2 pr-4">État</th>
            <th class="text-left py-2 pr-4">MAC</th>
            <th class="text-left py-2 pr-4">Adresses IP</th>
            <th class="text-left py-2 pr-4">Débit</th>
            <th class="text-left py-2 pr-4">Pilote</th>
            <th class="text-left py-2">Bond</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <tr
            v-for="n in network"
            :key="n.name"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/30"
          >
            <td class="py-2 pr-4 font-mono font-semibold text-xs">{{ n.name }}</td>
            <td class="py-2 pr-4">
              <span class="inline-flex items-center gap-1.5 text-xs">
                <span
                  class="inline-block w-2 h-2 rounded-full shrink-0"
                  :class="n.state === 'up' ? 'bg-green-400' : 'bg-gray-300'"
                />
                {{ n.state }}
              </span>
            </td>
            <td class="py-2 pr-4 font-mono text-xs text-gray-400">{{ n.macAddress || '—' }}</td>
            <td class="py-2 pr-4">
              <span
                v-for="a in n.addresses.filter(x => x.family === 'inet')"
                :key="a.address"
                class="font-mono text-xs block"
              >{{ a.address }}/{{ a.prefixLen }}</span>
              <span v-if="!n.addresses.filter(x => x.family === 'inet').length" class="text-xs text-gray-300">—</span>
            </td>
            <td class="py-2 pr-4 text-xs">{{ n.speed ? `${n.speed} Mb/s` : '—' }}</td>
            <td class="py-2 pr-4 text-xs text-gray-400">{{ n.driver || '—' }}</td>
            <td class="py-2">
              <UBadge v-if="n.isBond" color="purple" variant="subtle" size="xs">bond</UBadge>
              <span v-else class="text-xs text-gray-300">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NetworkInterface } from '~/server/utils/types'

defineProps<{ network: NetworkInterface[] }>()
</script>
