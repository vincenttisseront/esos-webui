<script setup lang="ts">
import { formatKbps, formatKbTotal } from '~/stores/stats'

/**
 * Table des métriques I/O par device SCST (handler vdisk_fileio, …).
 * (cf. SDD v2.2 §3.3).
 */

const stats = useStatsStore()
const devices = computed(() =>
  [...stats.devices].sort(
    (a, b) =>
      b.readKbPerSec + b.writeKbPerSec - (a.readKbPerSec + a.writeKbPerSec),
  ),
)
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
  >
    <div
      class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700"
    >
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Devices (handler)
      </h3>
      <UBadge color="gray" size="xs">{{ devices.length }} devices</UBadge>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead
          class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700"
        >
          <tr>
            <th class="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Device
            </th>
            <th class="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Handler
            </th>
            <th class="text-right px-3 py-2 text-blue-600 font-medium">
              Read total
            </th>
            <th class="text-right px-3 py-2 text-orange-500 font-medium">
              Write total
            </th>
            <th class="text-right px-3 py-2 text-blue-600 font-medium">
              Read /s
            </th>
            <th class="text-right px-3 py-2 text-orange-500 font-medium">
              Write /s
            </th>
            <th class="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">
              IOPS R
            </th>
            <th class="text-right px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">
              IOPS W
            </th>
            <th class="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Activité (2min)
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
          <tr
            v-for="device in devices"
            :key="`${device.handler}|${device.device}`"
            class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <td
              class="px-4 py-2.5 font-mono text-gray-800 dark:text-gray-100"
            >
              {{ device.device }}
            </td>
            <td class="px-3 py-2.5 text-gray-500 dark:text-gray-400">{{ device.handler }}</td>
            <td
              class="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-200"
            >
              {{ formatKbTotal(device.readKbTotal) }}
            </td>
            <td
              class="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-200"
            >
              {{ formatKbTotal(device.writeKbTotal) }}
            </td>
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="
                  device.readKbPerSec > 0 ? 'text-blue-600' : 'text-gray-300'
                "
              >
                {{
                  device.readKbPerSec > 0
                    ? formatKbps(device.readKbPerSec)
                    : '—'
                }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="
                  device.writeKbPerSec > 0
                    ? 'text-orange-500'
                    : 'text-gray-300'
                "
              >
                {{
                  device.writeKbPerSec > 0
                    ? formatKbps(device.writeKbPerSec)
                    : '—'
                }}
              </span>
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400">
              {{
                device.readOpsPerSec > 0 ? device.readOpsPerSec + '/s' : '—'
              }}
            </td>
            <td class="px-3 py-2.5 text-right font-mono text-gray-500 dark:text-gray-400">
              {{
                device.writeOpsPerSec > 0
                  ? device.writeOpsPerSec + '/s'
                  : '—'
              }}
            </td>
            <td class="px-4 py-2.5">
              <SparkLine :data="device.history" :width="120" :height="24" />
            </td>
          </tr>

          <tr v-if="devices.length === 0">
            <td
              colspan="9"
              class="px-4 py-6 text-center text-gray-400 text-xs italic"
            >
              Aucun device disponible
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
