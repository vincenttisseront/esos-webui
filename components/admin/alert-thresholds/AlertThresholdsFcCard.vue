<script setup lang="ts">
import type { AlertThresholdForm } from '~/utils/alert-thresholds-validation'
import type { FcPortPreviewRow } from '~/utils/alert-thresholds-preview'

const form = defineModel<AlertThresholdForm>({ required: true })

defineProps<{
  previewRows: FcPortPreviewRow[]
}>()

const { t } = useEsosI18n()
</script>

<template>
  <section class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
    <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      {{ t('admin.alertThresholds.fc.title') }}
    </h2>

    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
          {{ t('admin.alertThresholds.fc.enabledLabel') }}
        </p>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {{ t('admin.alertThresholds.fc.enabledHelp') }}
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2 italic">
          {{ t('admin.alertThresholds.fc.debounceFuture') }}
        </p>
      </div>
      <UToggle v-model="form.fcPortEnabled" />
    </div>

    <div class="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.alertThresholds.fc.previewTitle') }}
      </p>
      <p v-if="previewRows.length === 0" class="text-sm text-gray-500">
        {{ t('admin.alertThresholds.fc.previewEmpty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500">
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.fc.colHost') }}</th>
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.fc.colPort') }}</th>
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.fc.colState') }}</th>
              <th class="py-1">{{ t('admin.alertThresholds.fc.colAlert') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in previewRows"
              :key="`${row.host}-${row.portName}`"
              class="border-t border-gray-100 dark:border-gray-800"
            >
              <td class="py-1.5 pr-2 font-mono">{{ row.host }}</td>
              <td class="py-1.5 pr-2 font-mono truncate max-w-[12rem]" :title="row.portName">{{ row.portName }}</td>
              <td class="py-1.5 pr-2">{{ row.portState }}</td>
              <td class="py-1.5">
                <UBadge :color="row.wouldAlert ? 'red' : 'gray'" variant="subtle" size="xs">
                  {{ row.wouldAlert ? t('admin.alertThresholds.fc.yes') : t('admin.alertThresholds.fc.no') }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
