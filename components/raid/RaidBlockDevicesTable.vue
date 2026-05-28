<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.device') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.type') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_hw_raid') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_controller') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.size') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.tags') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.mounts') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_lvm') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.page.devices.col_fileio') }}</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.block_device.col.md_eligibility') }}</th>
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
            <div class="flex flex-wrap gap-1 max-w-[14rem]">
              <UBadge
                v-if="dev.esosSystemProtected"
                color="red"
                :label="t('raid.page.devices.esos_protected')"
                size="xs"
                variant="soft"
              />
              <UBadge
                v-for="tag in rowDisplay(dev).tags.usedBy"
                :key="`u-${tag}`"
                :color="usedByColor(tag)"
                :label="translateUsedByTag(tag, t)"
                size="xs"
                variant="soft"
              />
              <UBadge
                v-for="sig in rowDisplay(dev).tags.signatures"
                :key="`s-${sig}`"
                color="gray"
                :label="translateSignatureTag(sig, t)"
                size="xs"
                variant="outline"
              />
              <span
                v-if="!dev.esosSystemProtected && !rowDisplay(dev).tags.usedBy.length && !rowDisplay(dev).tags.signatures.length"
                class="text-gray-400"
              >—</span>
            </div>
          </td>
          <td class="py-1.5 pr-3 text-[10px] font-mono text-gray-600 dark:text-gray-400 max-w-[10rem]">
            <template v-if="rowDisplay(dev).mounts.length">
              <UTooltip
                v-if="rowDisplay(dev).mounts.length > 1"
                :text="rowDisplay(dev).mounts.join('\n')"
              >
                <span>{{ rowDisplay(dev).mounts[0] }}</span>
                <span class="text-gray-400 ml-0.5">+{{ rowDisplay(dev).mounts.length - 1 }}</span>
              </UTooltip>
              <span v-else>{{ rowDisplay(dev).mounts[0] }}</span>
            </template>
            <span v-else>—</span>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-1 min-w-0">
              <UIcon
                :name="rowMeta(dev).lvmEligible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="rowMeta(dev).lvmEligible ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <UTooltip
                v-if="hwEligibilityTooltip(dev, 'lvm')"
                :text="hwEligibilityTooltip(dev, 'lvm')"
              >
                <span
                  v-if="hwEligibilitySummary(dev, 'lvm')"
                  class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[9rem]"
                >{{ hwEligibilitySummary(dev, 'lvm') }}</span>
              </UTooltip>
            </div>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-1 min-w-0">
              <UIcon
                :name="rowMeta(dev).fileioEligible ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="rowMeta(dev).fileioEligible ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <UTooltip
                v-if="hwEligibilityTooltip(dev, 'fileio')"
                :text="hwEligibilityTooltip(dev, 'fileio')"
              >
                <span
                  v-if="hwEligibilitySummary(dev, 'fileio')"
                  class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[9rem]"
                >{{ hwEligibilitySummary(dev, 'fileio') }}</span>
              </UTooltip>
            </div>
          </td>
          <td class="py-1.5 pr-3">
            <div class="flex items-center gap-1 min-w-0">
              <UIcon
                :name="dev.eligibleForMd ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                :class="dev.eligibleForMd ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'"
                class="w-4 h-4 shrink-0"
              />
              <UTooltip
                v-if="mdEligibilityTooltip(dev)"
                :text="mdEligibilityTooltip(dev)"
              >
                <span
                  v-if="mdEligibilitySummary(dev)"
                  class="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[9rem]"
                >{{ mdEligibilitySummary(dev) }}</span>
              </UTooltip>
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
import {
  buildBlockDeviceRowDisplay,
  buildDeviceDisplayTags,
  collectUniqueMountPoints,
  dedupeEligibilityReasons,
  dedupeStrings,
  formatIneligibleSummary,
  pickPrimaryEligibilityReason,
  translateSignatureTag,
  translateUsedByTag,
} from '~/utils/block-device-display'

const props = defineProps<{
  devices: RaidBlockDevice[]
  controllers?: HardwareRaidController[]
  highlightPath?: string | null
}>()

const { t } = useEsosI18n()

interface RowMeta {
  isHwVd: boolean
  controllerLabel?: string
  lvmEligible: boolean
  fileioEligible: boolean
  reasons: string[]
}

interface RowDisplay {
  tags: ReturnType<typeof buildDeviceDisplayTags>
  mounts: string[]
  mdReasons: string[]
}

const metaCache = new Map<string, RowMeta>()
const displayCache = new Map<string, RowDisplay>()

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

function rowDisplay(dev: RaidBlockDevice): RowDisplay {
  const cached = displayCache.get(dev.path)
  if (cached) return cached
  const mdReasons = dedupeStrings(dev.mdEligibilityReasons ?? [])
  const display: RowDisplay = {
    tags: buildDeviceDisplayTags(dev),
    mounts: collectUniqueMountPoints({ mountpoint: dev.mountpoint, reasons: mdReasons }),
    mdReasons,
  }
  displayCache.set(dev.path, display)
  return display
}

watch(() => props.devices, () => {
  metaCache.clear()
  displayCache.clear()
}, { deep: true })

function hwReasons(dev: RaidBlockDevice): string[] {
  return rowMeta(dev).isHwVd ? rowMeta(dev).reasons : []
}

function hwEligibilitySummary(dev: RaidBlockDevice, kind: 'lvm' | 'fileio'): string {
  const meta = rowMeta(dev)
  const eligible = kind === 'lvm' ? meta.lvmEligible : meta.fileioEligible
  if (eligible) return ''
  return formatIneligibleSummary(hwReasons(dev), t)
}

function hwEligibilityTooltip(dev: RaidBlockDevice, kind: 'lvm' | 'fileio'): string {
  const reasons = dedupeEligibilityReasons(hwReasons(dev))
  if (reasons.length <= 1) return ''
  return pickPrimaryEligibilityReason(reasons, t).all.join('\n')
}

function mdEligibilitySummary(dev: RaidBlockDevice): string {
  if (dev.eligibleForMd) return ''
  return formatIneligibleSummary(rowDisplay(dev).mdReasons, t)
}

function mdEligibilityTooltip(dev: RaidBlockDevice): string {
  const reasons = rowDisplay(dev).mdReasons
  if (reasons.length <= 1) return ''
  return pickPrimaryEligibilityReason(reasons, t).all.join('\n')
}

function usedByColor(usage: string) {
  if (usage === 'mounted') return 'red'
  if (usage === 'md') return 'blue'
  if (usage === 'lvm') return 'amber'
  if (usage === 'scst') return 'purple'
  if (usage === 'hardware_raid') return 'purple'
  if (usage === 'filesystem') return 'gray'
  return 'gray'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`
  return `${bytes} B`
}
</script>
