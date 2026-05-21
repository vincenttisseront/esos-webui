<script setup lang="ts">
import { formatKbps } from '~/stores/stats'

/**
 * Table I/O des disques physiques lue depuis /proc/diskstats (source iotop/iostat).
 * Donne la vue "backend" : ce que les vrais disques font, indépendamment de SCST.
 */

const stats = useStatsStore()

const disks = computed(() =>
  [...stats.disks].sort(
    (a, b) => b.readKbPerSec + b.writeKbPerSec - (a.readKbPerSec + a.writeKbPerSec),
  ),
)
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
      <div>
        <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Disques physiques
        </h3>
        <p class="text-xs text-gray-400 mt-0.5">
          I/O backend — source : <span class="font-mono">/proc/diskstats</span>
        </p>
      </div>
      <UBadge color="gray" size="xs">{{ disks.length }} disques</UBadge>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700">
          <tr>
            <th class="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Disque</th>
            <th class="text-right px-3 py-2 text-blue-600 font-medium">Read /s</th>
            <th class="text-right px-3 py-2 text-orange-500 font-medium">Write /s</th>
            <th class="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">IOPS R</th>
            <th class="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">IOPS W</th>
            <th class="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">I/Os en cours</th>
            <th class="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">Activité (2min)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
          <tr
            v-for="disk in disks"
            :key="disk.device"
            class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <td class="px-4 py-2.5 font-mono font-medium text-gray-800 dark:text-gray-100">
              {{ disk.device }}
            </td>
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="disk.readKbPerSec > 0 ? 'text-blue-600' : 'text-gray-300'"
              >
                {{ disk.readKbPerSec > 0 ? formatKbps(disk.readKbPerSec) : '—' }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="disk.writeKbPerSec > 0 ? 'text-orange-500' : 'text-gray-300'"
              >
                {{ disk.writeKbPerSec > 0 ? formatKbps(disk.writeKbPerSec) : '—' }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400">
              {{ disk.readOpsPerSec > 0 ? disk.readOpsPerSec + '/s' : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400">
              {{ disk.writeOpsPerSec > 0 ? disk.writeOpsPerSec + '/s' : '—' }}
            </td>
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-mono"
                :class="disk.iosInProgress > 0 ? 'text-yellow-600 font-medium' : 'text-gray-300'"
              >
                {{ disk.iosInProgress > 0 ? disk.iosInProgress : '—' }}
              </span>
            </td>
            <td class="px-4 py-2.5">
              <SparkLine :data="disk.history" :width="120" :height="24" />
            </td>
          </tr>

          <tr v-if="disks.length === 0">
            <td colspan="7" class="px-4 py-6 text-center text-gray-400 text-xs italic">
              Aucun disque détecté
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
