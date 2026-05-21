<script setup lang="ts">
import { formatKbps, formatKbTotal } from '~/stores/stats'

/**
 * Table sessions répliquant la TUI ESOS + colonnes débit et sparkline
 * (cf. SDD v2.2 §7.1).
 */

const stats = useStatsStore()
const sessions = computed(() => stats.sessionsByActivity)

function shortWwn(wwn: string): string {
  // "21:00:00:24:ff:91:60:bc" → "60:bc"
  return wwn.split(':').slice(-2).join(':')
}
</script>

<template>
  <div
    class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
  >
    <div
      class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700"
    >
      <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-200">
        Sessions actives
      </h3>
      <div class="flex items-center gap-3 text-xs text-gray-400">
        <span>
          Total R :
          <span class="text-blue-600 font-medium">
            {{ stats.totalReadFormatted }}
          </span>
        </span>
        <span>
          Total W :
          <span class="text-orange-500 font-medium">
            {{ stats.totalWriteFormatted }}
          </span>
        </span>
        <UBadge color="gray" size="xs">{{ sessions.length }} sessions</UBadge>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead
          class="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700"
        >
          <tr>
            <th class="text-left px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Initiateur (WWN)
            </th>
            <th class="text-center px-3 py-2 text-gray-500 dark:text-gray-400 font-medium">
              LUNs
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
            <th class="px-4 py-2 text-gray-500 dark:text-gray-400 font-medium">
              Activité (2min)
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-700">
          <tr
            v-for="session in sessions"
            :key="`${session.target}|${session.initiator}`"
            class="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <!-- WWN initiateur + cible abrégée -->
            <td class="px-4 py-2.5">
              <span class="font-mono text-gray-800 dark:text-gray-100">
                {{ session.initiator }}
              </span>
              <span class="ml-2 text-gray-400 font-mono">
                ↳ {{ shortWwn(session.target) }}
              </span>
            </td>

            <!-- LUNs -->
            <td class="px-3 py-2.5 text-center text-gray-600 dark:text-gray-300">
              {{ session.lunsCount }}
            </td>

            <!-- Read total -->
            <td
              class="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-200"
            >
              {{ formatKbTotal(session.readKbTotal) }}
            </td>

            <!-- Write total -->
            <td
              class="px-3 py-2.5 text-right font-mono text-gray-700 dark:text-gray-200"
            >
              {{ formatKbTotal(session.writeKbTotal) }}
            </td>

            <!-- Débit read -->
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="
                  session.readKbPerSec > 0 ? 'text-blue-600' : 'text-gray-300'
                "
              >
                {{
                  session.readKbPerSec > 0
                    ? formatKbps(session.readKbPerSec)
                    : '—'
                }}
              </span>
            </td>

            <!-- Débit write -->
            <td class="px-3 py-2.5 text-right">
              <span
                class="font-medium"
                :class="
                  session.writeKbPerSec > 0
                    ? 'text-orange-500'
                    : 'text-gray-300'
                "
              >
                {{
                  session.writeKbPerSec > 0
                    ? formatKbps(session.writeKbPerSec)
                    : '—'
                }}
              </span>
            </td>

            <!-- Sparkline -->
            <td class="px-4 py-2.5">
              <SparkLine :data="session.history" :width="120" :height="24" />
            </td>
          </tr>

          <tr v-if="sessions.length === 0">
            <td
              colspan="7"
              class="px-4 py-6 text-center text-gray-400 text-xs italic"
            >
              Aucune session active
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
