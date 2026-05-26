<script setup lang="ts">
import type { AlertThresholdForm, AlertThresholdValidationId } from '~/utils/alert-thresholds-validation'
import type { VolumePreviewRow } from '~/utils/alert-thresholds-preview'
import { DEFAULT_ALERT_SETTINGS } from '~/server/utils/alert-settings'

const form = defineModel<AlertThresholdForm>({ required: true })

defineProps<{
  validationIds: AlertThresholdValidationId[]
  previewRows: VolumePreviewRow[]
}>()

const { t } = useEsosI18n()

function fieldError(id: AlertThresholdValidationId, ids: AlertThresholdValidationId[]) {
  return ids.includes(id) ? t(`admin.alertThresholds.validation.${id}`) : undefined
}

function statusColor(status: VolumePreviewRow['status']) {
  if (status === 'critical') return 'red'
  if (status === 'warning') return 'amber'
  return 'green'
}

function statusLabel(status: VolumePreviewRow['status']) {
  if (status === 'critical') return t('admin.alertThresholds.volume.statusCritical')
  if (status === 'warning') return t('admin.alertThresholds.volume.statusWarning')
  return t('admin.alertThresholds.volume.statusOk')
}
</script>

<template>
  <section class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
    <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      {{ t('admin.alertThresholds.volume.title') }}
    </h2>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <AppFormField
        :label="t('admin.alertThresholds.volume.warnLabel')"
        :help="t('admin.alertThresholds.volume.warnHelp')"
        :error="fieldError('volume_warn_range', validationIds) ?? fieldError('volume_warn_lt_critical', validationIds)"
      >
        <div class="flex items-center gap-2">
          <AppTextInput
            v-model.number="form.volumeWarnPct"
            type="number"
            min="0"
            max="100"
            class="flex-1"
          />
          <span class="text-sm text-gray-500 shrink-0">%</span>
        </div>
      </AppFormField>
      <AppFormField
        :label="t('admin.alertThresholds.volume.criticalLabel')"
        :help="t('admin.alertThresholds.volume.criticalHelp')"
        :error="fieldError('volume_critical_range', validationIds) ?? fieldError('volume_warn_lt_critical', validationIds)"
      >
        <div class="flex items-center gap-2">
          <AppTextInput
            v-model.number="form.volumeCriticalPct"
            type="number"
            min="0"
            max="100"
            class="flex-1"
          />
          <span class="text-sm text-gray-500 shrink-0">%</span>
        </div>
      </AppFormField>
    </div>

    <p class="text-xs text-gray-500 dark:text-gray-400">
      {{ t('admin.alertThresholds.defaults.hint', {
        warn: DEFAULT_ALERT_SETTINGS.volumeWarnPct,
        critical: DEFAULT_ALERT_SETTINGS.volumeCriticalPct,
        grace: DEFAULT_ALERT_SETTINGS.sessionGraceSec,
        min: DEFAULT_ALERT_SETTINGS.sessionMinActive,
      }) }}
    </p>

    <div class="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.alertThresholds.volume.previewTitle') }}
      </p>
      <p v-if="previewRows.length === 0" class="text-sm text-gray-500">
        {{ t('admin.alertThresholds.volume.previewEmpty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500">
              <th class="py-1 pr-3">{{ t('admin.alertThresholds.volume.colMount') }}</th>
              <th class="py-1 pr-3">{{ t('admin.alertThresholds.volume.colUsed') }}</th>
              <th class="py-1">{{ t('admin.alertThresholds.volume.colStatus') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.mountpoint" class="border-t border-gray-100 dark:border-gray-800">
              <td class="py-1.5 pr-3 font-mono">{{ row.mountpoint }}</td>
              <td class="py-1.5 pr-3">{{ row.usedPct }}%</td>
              <td class="py-1.5">
                <UBadge :color="statusColor(row.status)" variant="subtle" size="xs">
                  {{ statusLabel(row.status) }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
