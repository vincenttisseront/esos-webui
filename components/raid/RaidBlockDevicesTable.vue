<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">Device</th>
          <th class="text-left py-1.5 pr-3">Type</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_hw_raid') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_controller') }}</th>
          <th class="text-left py-1.5 pr-3">Taille</th>
          <th class="text-left py-1.5 pr-3">Utilisation</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_lvm') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_fileio') }}</th>
          <th class="text-left py-1.5 pr-3">Montage</th>
          <th class="text-left py-1.5 pr-3">Éligible MD</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="dev in devices"
          :key="dev.path"
          class="border-b border-gray-100 dark:border-gray-800"
          :class="{
            'opacity-50': !dev.eligibleForMd && !dev.eligibleForHardwareRaid && !rowMeta(dev).isHwVd,
            'bg-purple-50/60 dark:bg-purple-950/30': highlightPath === dev.path,
          }"
        >
          <td class="py-1.5 pr-3 font-mono">{{ dev.path }}</td>
          <td class="py-1.5 pr-3 uppercase text-[10px] text-gray-500 dark:text-gray-400">{{ dev.type }}</td>
          <td class="py-1.5 pr-3">
            <UBadge
              v-if="rowMeta(dev).isHwVd"
              color="purple"
              :label="t('raid.page.devices.badge_hw_vd')"
              size="xs"
              variant="soft"
            />
            <span v-else class="text-gray-400">—</span>
          </td>
          <td class="py-1.5 pr-3 text-[10px] text-gray-500 dark:text-gray-400">
            {{ rowMeta(dev).controllerLabel ?? '—' }}
          </td>
          <td class="py-1.5 pr-3 tabular-nums">{{ formatSize(dev.sizeBytes) }}</td>
          <td class="py-1.5 pr-3">
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-if="dev.esosSystemProtected"
                color="red"
                :label="t('raid.page.devices.esos_protected')"
                size="xs"
                variant="soft"
              />
              <UBadge
                v-for="u in dev.usedBy"
                :key="u"
                :color="usedByColor(u)"
                :label="usedByLabel(u)"
                size="xs"
                variant="soft"
              />
              <span v-if="!dev.usedBy.length && !dev.esosSystemProtected" class="text-gray-400">—</span>
            </div>
            <p
              v-if="dev.esosSystemProtected && dev.esosProtection?.reasons?.length"
              class="text-[10px] text-red-600 dark:text-red-400 mt-0.5 max-w-xs"
            >
              {{ dev.esosProtection.reasons.map(r => r.message).join(' · ') }}
            </p>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-1">
              <UIcon
                :name="rowMeta(dev).lvmEligible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="rowMeta(dev).lvmEligible ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <span
                v-if="rowMeta(dev).isHwVd && !rowMeta(dev).lvmEligible && rowMeta(dev).reasons.length"
                class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[8rem]"
                :title="rowMeta(dev).reasons.join(', ')"
              >{{ rowMeta(dev).reasons[0] }}</span>
            </div>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-1">
              <UIcon
                :name="rowMeta(dev).fileioEligible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="rowMeta(dev).fileioEligible ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <span
                v-if="rowMeta(dev).isHwVd && !rowMeta(dev).fileioEligible && rowMeta(dev).reasons.length"
                class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[8rem]"
                :title="rowMeta(dev).reasons.join(', ')"
              >{{ rowMeta(dev).reasons[0] }}</span>
            </div>
          </td>
          <td class="py-1.5 pr-3 font-mono text-gray-500 dark:text-gray-400 text-[10px]">{{ dev.mountpoint ?? '—' }}</td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-2">
              <UIcon
                :name="dev.eligibleForMd ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="dev.eligibleForMd ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <span v-if="!dev.eligibleForMd && dev.mdEligibilityReasons?.length" class="text-[10px] text-gray-500 dark:text-gray-400">
                {{ dev.mdEligibilityReasons.join(', ') }}
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidController, RaidBlockDevice } from '~/types/raid'
import {
  evaluateHwBackendEligibility,
  findLogicalDriveForOsPath,
} from '~/utils/hw-raid-backend-eligibility'

const props = defineProps<{
  devices: RaidBlockDevice[]
  controllers?: HardwareRaidController[]
  highlightPath?: string | null
}>()

const { t } = useI18n()

interface RowMeta {
  isHwVd: boolean
  controllerLabel?: string
  lvmEligible: boolean
  fileioEligible: boolean
  reasons: string[]
}

const metaCache = new Map<string, RowMeta>()

function rowMeta(dev: RaidBlockDevice): RowMeta {
  const cached = metaCache.get(dev.path)
  if (cached) return cached
  const isHwVd = dev.usedBy.includes('hardware_raid') || !!dev.hwRaidLdId
  const hit = props.controllers?.length
    ? findLogicalDriveForOsPath(props.controllers, dev.path)
    : null
  const eligibility = evaluateHwBackendEligibility(dev, hit?.ld)
  const meta: RowMeta = {
    isHwVd,
    controllerLabel: dev.hwRaidControllerLabel ?? hit?.controller.model ?? hit?.controller.id,
    lvmEligible: isHwVd ? eligibility.lvmEligible : false,
    fileioEligible: isHwVd ? eligibility.fileioEligible : false,
    reasons: isHwVd ? eligibility.reasons : [],
  }
  metaCache.set(dev.path, meta)
  return meta
}

watch(() => props.devices, () => metaCache.clear(), { deep: true })

function usedByColor(usage: string) {
  if (usage === 'mounted') return 'red'
  if (usage === 'md') return 'blue'
  if (usage === 'lvm') return 'amber'
  if (usage === 'scst') return 'purple'
  if (usage === 'hardware_raid') return 'purple'
  if (usage === 'filesystem') return 'gray'
  return 'gray'
}

function usedByLabel(usage: string) {
  if (usage === 'hardware_raid') return t('raid.page.devices.used_by_hardware_raid')
  return usage
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
