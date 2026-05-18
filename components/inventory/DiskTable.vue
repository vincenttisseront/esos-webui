<template>
  <div>
    <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Block Devices</h3>

    <p v-if="!disks.length" class="text-sm text-gray-400 italic">Aucun block device détecté</p>

    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-gray-100 dark:border-gray-800">
          <tr class="text-xs font-medium text-gray-400 uppercase tracking-wide">
            <th class="text-left py-2 pr-4">Périph.</th>
            <th class="text-left py-2 pr-4">Type</th>
            <th class="text-right py-2 pr-4">Taille</th>
            <th class="text-left py-2 pr-4">Modèle</th>
            <th class="text-left py-2 pr-4">Numéro de série</th>
            <th class="text-left py-2 pr-4">SMART</th>
            <th class="py-2 w-8"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
          <tr
            v-for="d in disks"
            :key="d.name"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/30"
          >
            <td class="py-2 pr-4 font-mono font-semibold text-xs">/dev/{{ d.name }}</td>
            <td class="py-2 pr-4">
              <UBadge
                v-if="isRaidVolume(d)"
                color="violet"
                variant="subtle"
                size="xs"
              >Volume RAID</UBadge>
              <DiskTypeBadge v-else :type="d.type" />
            </td>
            <td class="py-2 pr-4 text-right tabular-nums text-xs">{{ formatBytes(d.sizeBytes) }}</td>
            <td class="py-2 pr-4 text-xs text-gray-600 dark:text-gray-300">{{ d.model || '—' }}</td>
            <td class="py-2 pr-4 font-mono text-xs text-gray-400">{{ d.serial || '—' }}</td>
            <td class="py-2 pr-4">
              <span v-if="isRaidVolume(d)" class="text-xs text-gray-400 italic">non applicable</span>
              <template v-else-if="d.smart">
                <SmartHealthBadge :smart="d.smart" class="cursor-pointer" @click="openDetail(d)" />
                <span class="ml-1.5 text-xs text-gray-400">{{ d.smart.temperature != null ? `${d.smart.temperature}°C` : '' }}</span>
              </template>
              <span v-else class="text-xs text-gray-300">N/A</span>
            </td>
            <td class="py-2">
              <UButton v-if="d.smart && !isRaidVolume(d)" size="xs" variant="ghost" icon="i-heroicons-eye" @click="openDetail(d)" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- SMART detail slideover -->
    <USlideover v-model="open">
      <div v-if="selectedDisk" class="p-6">
        <SmartDetailPanel :disk="selectedDisk" @close="open = false" />
      </div>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
import type { DiskDevice } from '~/server/utils/types'

defineProps<{ disks: DiskDevice[] }>()

const open         = ref(false)
const selectedDisk = ref<DiskDevice | null>(null)

const RAID_CONTROLLER_MODELS = /perc|megaraid|h730|h710|h330|h730p|storcli|arcconf|aacraid|lsi/i

function isRaidVolume(d: DiskDevice): boolean {
  return RAID_CONTROLLER_MODELS.test(d.model) || RAID_CONTROLLER_MODELS.test(d.vendor)
}

function openDetail(disk: DiskDevice) {
  selectedDisk.value = disk
  open.value = true
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
