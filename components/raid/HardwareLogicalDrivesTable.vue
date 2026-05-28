<template>
  <div class="overflow-x-auto">
    <table class="w-full text-xs text-gray-700 dark:text-gray-300">
      <thead>
        <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase tracking-wide text-[10px]">
          <th class="text-left py-1.5 pr-3">ID / SCSI</th>
          <th class="text-left py-1.5 pr-3">RAID</th>
          <th class="text-left py-1.5 pr-3">{{ t('raid.system_volume.col_status') }}</th>
          <th class="text-left py-1.5 pr-3">État</th>
          <th class="text-left py-1.5 pr-3">Taille</th>
          <th class="text-left py-1.5 pr-3">Cache</th>
          <th class="text-left py-1.5 pr-3">Device</th>
          <th class="text-right py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="drive in drives"
          :key="drive.id"
          class="border-b border-gray-100 dark:border-gray-800"
        >
          <td class="py-1.5 pr-3 font-mono text-gray-600 dark:text-gray-400">
            {{ drive.scsiAddress ?? drive.id }}
            <span v-if="drive.scsiModel" class="block text-[10px] text-gray-400 dark:text-gray-600">{{ drive.scsiModel }}</span>
          </td>
          <td class="py-1.5 pr-3">
            <span v-if="drive.raidLevel === 'unknown'" class="text-gray-400 italic">—</span>
            <span v-else>RAID{{ drive.raidLevel }}</span>
          </td>
          <td class="py-1.5 pr-3">
            <UPopover v-if="drive.esosSystemProtected">
              <UBadge
                color="blue"
                variant="soft"
                size="xs"
                :label="t('raid.system_volume.badge')"
                class="cursor-help"
              />
              <template #panel>
                <div class="p-3 max-w-sm text-xs space-y-2">
                  <p class="font-medium text-gray-900 dark:text-gray-100">{{ t('raid.system_volume.tooltip_title') }}</p>
                  <p class="text-gray-600 dark:text-gray-400">{{ t('raid.system_volume.tooltip_body') }}</p>
                  <ul v-if="protectionReasons(drive).length" class="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                    <li v-for="(r, i) in protectionReasons(drive)" :key="i">{{ r }}</li>
                  </ul>
                  <p v-if="drive.esosProtection?.protectedDevice" class="font-mono text-[10px] text-gray-500">
                    {{ drive.esosProtection.protectedDevice }}
                  </p>
                </div>
              </template>
            </UPopover>
            <span v-else class="text-gray-400">—</span>
          </td>
          <td class="py-1.5 pr-3">
            <UBadge :color="ldStateColor(drive.state)" :label="drive.state" size="xs" variant="soft" />
          </td>
          <td class="py-1.5 pr-3 tabular-nums">{{ drive.sizeBytes ? formatSize(drive.sizeBytes) : '—' }}</td>
          <td class="py-1.5 pr-3 text-gray-500 dark:text-gray-400">{{ drive.cachePolicy ?? '—' }}</td>
          <td class="py-1.5 pr-3 font-mono text-gray-500 dark:text-gray-400 text-[10px]">
            <span v-if="!vdNeedsOsRescan(drive)">{{ vdDeviceText(drive, t('raid.page.devices.device_not_detected_os')) }}</span>
            <span v-else class="text-amber-700 dark:text-amber-300">{{ t('raid.page.devices.device_not_detected_os') }}</span>
          </td>
          <td class="py-1.5 text-right">
            <UButton
              v-if="vdNeedsOsRescan(drive) && !readOnly"
              size="xs"
              color="amber"
              variant="soft"
              class="mr-1"
              @click="$emit('rescan-ld', drive)"
            >
              {{ t('raid.page.devices.action_rescan_scsi') }}
            </UButton>
            <UTooltip
              v-if="supportsDelete && !readOnly && drive.esosSystemProtected"
              :text="t('raid.system_volume.delete_blocked_tooltip')"
            >
              <span class="inline-block">
                <UButton
                  size="xs"
                  color="red"
                  variant="ghost"
                  icon="i-heroicons-trash"
                  disabled
                />
              </span>
            </UTooltip>
            <UButton
              v-else-if="supportsDelete && !readOnly"
              size="xs"
              color="red"
              variant="ghost"
              icon="i-heroicons-trash"
              @click="$emit('delete-ld', drive)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="readOnly" class="mt-2 text-xs text-amber-600 dark:text-amber-400 italic">
      Niveau RAID et état détaillé indisponibles sans perccli/storcli.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { HardwareRaidLogicalDrive } from '~/types/raid'
import { vdDeviceText, vdNeedsOsRescan } from '~/utils/hw-raid-vd-ui'

defineProps<{
  drives: HardwareRaidLogicalDrive[]
  supportsDelete?: boolean
  readOnly?: boolean
}>()
defineEmits<{
  'delete-ld': [drive: HardwareRaidLogicalDrive]
  'rescan-ld': [drive: HardwareRaidLogicalDrive]
}>()

const { t } = useI18n()

function protectionReasons(drive: HardwareRaidLogicalDrive): string[] {
  return drive.esosProtection?.reasons?.map(r => r.message) ?? []
}

function ldStateColor(state: string) {
  if (state === 'optimal') return 'green'
  if (state === 'degraded') return 'red'
  if (state === 'rebuilding') return 'amber'
  if (state === 'failed') return 'red'
  return 'gray'
}

function formatSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}
</script>
