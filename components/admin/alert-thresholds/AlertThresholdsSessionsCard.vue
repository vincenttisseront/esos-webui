<script setup lang="ts">
import {
  applySessionModeToForm,
  formToSessionMode,
  type AlertThresholdForm,
  type AlertThresholdValidationId,
  type SessionModeUi,
} from '~/utils/alert-thresholds-validation'
import type { SessionPreviewRow } from '~/utils/alert-thresholds-preview'

const form = defineModel<AlertThresholdForm>({ required: true })

const props = defineProps<{
  validationIds: AlertThresholdValidationId[]
  previewRows: SessionPreviewRow[]
  disabledTargets: string[]
}>()

const { t } = useEsosI18n()

const MODES: SessionModeUi[] = ['disabled', 'strict', 'normal']

const sessionMode = computed({
  get: () => formToSessionMode(form.value),
  set: (mode: SessionModeUi) => applySessionModeToForm(mode, form.value),
})

function modeCardClass(mode: SessionModeUi) {
  const selected = mode === sessionMode.value
  return [
    'rounded-lg border p-3 text-left transition-colors w-full',
    selected
      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-500'
      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
    'cursor-pointer',
  ]
}

function fieldError(id: AlertThresholdValidationId) {
  return props.validationIds.includes(id)
    ? t(`admin.alertThresholds.validation.${id}`)
    : undefined
}

function timingLabel(row: SessionPreviewRow) {
  if (row.timing === 'immediate') {
    return t('admin.alertThresholds.sessions.timingImmediate')
  }
  return t('admin.alertThresholds.sessions.timingAfterGrace', { seconds: row.graceSec ?? 0 })
}
</script>

<template>
  <section class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 space-y-4">
    <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
      {{ t('admin.alertThresholds.sessions.title') }}
    </h2>

    <AppFormField :label="t('admin.alertThresholds.sessions.modeLabel')">
      <div
        role="radiogroup"
        class="grid grid-cols-1 gap-3"
      >
        <button
          v-for="mode in MODES"
          :key="mode"
          type="button"
          role="radio"
          :aria-checked="sessionMode === mode"
          :class="modeCardClass(mode)"
          @click="sessionMode = mode"
        >
          <span class="flex items-start gap-2">
            <span
              class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
              :class="sessionMode === mode
                ? 'border-primary-500 bg-primary-500'
                : 'border-gray-300 dark:border-gray-600'"
            >
              <span v-if="sessionMode === mode" class="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            <span class="min-w-0 space-y-0.5">
              <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">
                {{ t(`admin.alertThresholds.sessions.mode${mode === 'disabled' ? 'Disabled' : mode === 'strict' ? 'Strict' : 'Normal'}`) }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">
                {{ t(`admin.alertThresholds.sessions.mode${mode === 'disabled' ? 'Disabled' : mode === 'strict' ? 'Strict' : 'Normal'}Help`) }}
              </span>
            </span>
          </span>
        </button>
      </div>
    </AppFormField>

    <template v-if="form.sessionEnabled">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AppFormField
          :label="t('admin.alertThresholds.sessions.graceLabel')"
          :help="t('admin.alertThresholds.sessions.graceHelp')"
          :error="fieldError('session_grace_range')"
        >
          <div class="flex items-center gap-2">
            <AppTextInput
              v-model.number="form.sessionGraceSec"
              type="number"
              min="0"
              max="3600"
              class="flex-1"
            />
            <span class="text-sm text-gray-500 shrink-0">s</span>
          </div>
        </AppFormField>
        <AppFormField
          v-if="form.sessionPolicy === 'multipath'"
          :label="t('admin.alertThresholds.sessions.minActiveLabel')"
          :help="t('admin.alertThresholds.sessions.minActiveHelp')"
          :error="fieldError('session_min_active_range')"
        >
          <AppTextInput
            v-model.number="form.sessionMinActive"
            type="number"
            min="0"
            max="4096"
          />
        </AppFormField>
      </div>
    </template>

    <p class="text-xs text-gray-500 dark:text-gray-400">
      {{ t('admin.alertThresholds.sessions.disabledTargetsNote') }}
      <span v-if="disabledTargets.length" class="font-mono"> — {{ disabledTargets.join(', ') }}</span>
    </p>

    <div class="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.alertThresholds.sessions.previewTitle') }}
      </p>
      <p v-if="!form.sessionEnabled" class="text-sm text-gray-500">
        {{ t('admin.alertThresholds.sessions.previewDisabled') }}
      </p>
      <p v-else-if="previewRows.length === 0" class="text-sm text-gray-500">
        {{ t('admin.alertThresholds.sessions.previewEmpty') }}
      </p>
      <div v-else class="overflow-x-auto">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500">
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.sessions.colTarget') }}</th>
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.sessions.colGroup') }}</th>
              <th class="py-1 pr-2">{{ t('admin.alertThresholds.sessions.colDetail') }}</th>
              <th class="py-1">{{ t('admin.alertThresholds.sessions.colTiming') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in previewRows"
              :key="`${row.target}-${row.group}-${i}`"
              class="border-t border-gray-100 dark:border-gray-800"
            >
              <td class="py-1.5 pr-2 font-mono">{{ row.target }}</td>
              <td class="py-1.5 pr-2">{{ row.group }}</td>
              <td class="py-1.5 pr-2 font-mono">{{ row.detail }}</td>
              <td class="py-1.5">{{ timingLabel(row) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
