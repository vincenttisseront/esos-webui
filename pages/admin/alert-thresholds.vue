<script setup lang="ts">
import { DEFAULT_ALERT_SETTINGS } from '~/server/utils/alert-settings'
import {
  snapshotFromAlertThresholds,
  alertThresholdSnapshotsEqual,
  type AlertThresholdSnapshot,
} from '~/utils/alert-thresholds-form-state'
import {
  validateAlertThresholdForm,
  alertThresholdFormValid,
  type AlertThresholdForm,
} from '~/utils/alert-thresholds-validation'
import {
  previewVolumeStatuses,
  previewSessionViolations,
  previewFcPorts,
  previewDisabledTargets,
  formToAlertSettingsPreview,
} from '~/utils/alert-thresholds-preview'

definePageMeta({ layout: 'default' })

const admin         = useAdminStore()
const authStore     = useAuthStore()
const hardwareStore = useHardwareStore()
const { t, tError } = useEsosI18n()
const { success: toastOk, error: toastErr } = useAppToast()
const { overview, refresh: refreshOverview } = useOverview()

const form = reactive<AlertThresholdForm>({ ...DEFAULT_ALERT_SETTINGS })
const savedSnapshot = ref<AlertThresholdSnapshot | null>(null)
const saving = ref(false)

onMounted(async () => {
  if (authStore.user?.role !== 'admin') {
    await navigateTo('/admin', { replace: true })
    return
  }
  await Promise.all([
    admin.fetchAll(),
    hardwareStore.fetch(),
    refreshOverview(),
  ])
})

watch(
  () => admin.alertThresholds,
  (v) => {
    if (!v) return
    Object.assign(form, v)
    savedSnapshot.value = snapshotFromAlertThresholds(form)
  },
  { immediate: true },
)

const validationIds = computed(() => validateAlertThresholdForm(form))
const formValid = computed(() => alertThresholdFormValid(form))

const dirty = computed(() => {
  if (!savedSnapshot.value) return false
  return !alertThresholdSnapshotsEqual(savedSnapshot.value, snapshotFromAlertThresholds(form))
})

const previewSettings = computed(() => formToAlertSettingsPreview(form))

const volumePreview = computed(() =>
  previewVolumeStatuses(hardwareStore.data?.volumes ?? [], previewSettings.value),
)

const sessionPreview = computed(() =>
  overview.value
    ? previewSessionViolations(overview.value, previewSettings.value)
    : [],
)

const disabledTargets = computed(() =>
  overview.value ? previewDisabledTargets(overview.value) : [],
)

const fcPreview = computed(() =>
  previewFcPorts(hardwareStore.data?.fcPorts ?? [], form.fcPortEnabled),
)

function cancelEdits() {
  if (!savedSnapshot.value) return
  Object.assign(form, savedSnapshot.value)
}

function restoreDefaults() {
  Object.assign(form, { ...DEFAULT_ALERT_SETTINGS })
  toastOk(t('admin.alertThresholds.toasts.restored'), '')
}

async function save() {
  if (!formValid.value) return
  saving.value = true
  try {
    await admin.saveAlertThresholds({ ...form })
    savedSnapshot.value = snapshotFromAlertThresholds(form)
    toastOk(t('admin.alertThresholds.toasts.saveOk'))
  } catch (e: unknown) {
    toastErr(t('admin.alertThresholds.toasts.saveErr'), tError(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1 min-w-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ t('admin.alertThresholds.page.title') }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.alertThresholds.page.subtitle') }}
          </p>
        </div>
        <UButton
          to="/admin"
          color="gray"
          variant="soft"
          icon="i-heroicons-arrow-left"
          class="shrink-0 self-start"
        >
          {{ t('admin.alertThresholds.page.back') }}
        </UButton>
      </header>

      <div v-if="!admin.alertThresholds" class="text-gray-400 text-sm py-8">
        {{ t('admin.alertThresholds.page.loading') }}
      </div>

      <template v-else>
        <AlertThresholdsSectionActions
          :dirty="dirty"
          :saving="saving"
          :form-valid="formValid"
          @save="save"
          @cancel="cancelEdits"
        />

        <AlertThresholdsScopeBanner />

        <AlertThresholdsVolumeCard
          v-model="form"
          :validation-ids="validationIds"
          :preview-rows="volumePreview"
        />

        <AlertThresholdsSessionsCard
          v-model="form"
          :validation-ids="validationIds"
          :preview-rows="sessionPreview"
          :disabled-targets="disabledTargets"
        />

        <AlertThresholdsFcCard
          v-model="form"
          :preview-rows="fcPreview"
        />

        <AlertThresholdsPreviewNote />

        <div class="flex flex-wrap gap-3 justify-between items-center pt-2">
          <UButton
            color="gray"
            variant="ghost"
            size="sm"
            icon="i-heroicons-arrow-path"
            :label="t('admin.alertThresholds.defaults.restore')"
            @click="restoreDefaults"
          />
        </div>

        <AlertThresholdsSectionActions
          :dirty="dirty"
          :saving="saving"
          :form-valid="formValid"
          @save="save"
          @cancel="cancelEdits"
        />
      </template>
    </div>
  </div>
</template>
