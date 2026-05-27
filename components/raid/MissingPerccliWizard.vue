<template>
  <LvmWizardModalShell
    :title="t('raid.missing_tools.wizard.title') as string"
    :step="step + 1"
    :total-steps="7"
    icon="i-heroicons-wrench-screwdriver"
  >
    <!-- A. Need detected -->
    <div v-if="step === 0" class="space-y-3">
      <UAlert
        color="amber"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        :title="t('raid.missing_tools.need_title') as string"
        :description="t('raid.missing_tools.need_desc') as string"
      />
      <div class="text-sm text-gray-600 dark:text-gray-400">
        <p><strong>{{ t('raid.missing_tools.san') }}:</strong> <span class="font-mono">{{ sanId }}</span></p>
        <p v-if="readiness?.status === 'ok'"><strong>{{ t('raid.missing_tools.controller') }}:</strong> {{ readiness.data.controller.model ?? '—' }}</p>
      </div>
      <UButton size="sm" color="gray" variant="outline" :loading="loadingReadiness" @click="reloadReadiness">
        {{ t('raid.missing_tools.refresh') }}
      </UButton>
    </div>

    <!-- B. Package selection/upload -->
    <div v-else-if="step === 1" class="space-y-3">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-heroicons-document-arrow-up"
        :title="t('raid.missing_tools.package_title') as string"
        :description="t('raid.missing_tools.package_desc') as string"
      />
      <input ref="fileInput" type="file" accept=".rpm" class="block w-full text-sm" />
      <UButton
        size="sm"
        :disabled="uploading"
        :loading="uploading"
        @click="uploadRpm"
      >
        {{ t('raid.missing_tools.upload') }}
      </UButton>
      <p v-if="stagingId" class="text-xs text-gray-500">
        {{ t('raid.missing_tools.staging_id') }} <span class="font-mono">{{ stagingId }}</span>
      </p>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- C. Preflight -->
    <div v-else-if="step === 2" class="space-y-3">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-heroicons-shield-check"
        :title="t('raid.missing_tools.preflight_title') as string"
        :description="t('raid.missing_tools.preflight_desc') as string"
      />
      <div v-if="preflight" class="space-y-2">
        <div v-if="preflight.preflight.blockers.length" class="space-y-1">
          <p class="text-xs font-semibold text-red-600 uppercase tracking-wide">{{ t('raid.missing_tools.blockers') }}</p>
          <div v-for="b in preflight.preflight.blockers" :key="b" class="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            {{ b }}
          </div>
        </div>

        <div v-if="preflight.preflight.warnings.length" class="space-y-1">
          <p class="text-xs font-semibold text-amber-600 uppercase tracking-wide">{{ t('raid.missing_tools.warnings') }}</p>
          <div v-for="w in preflight.preflight.warnings" :key="w" class="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            {{ w }}
          </div>
        </div>

        <div v-if="preflight.preflight.detected.esosRootPartitions.length > 1" class="space-y-1">
          <p class="text-xs font-semibold text-gray-600 uppercase tracking-wide">{{ t('raid.missing_tools.select_root') }}</p>
          <USelect
            v-model="rootPartition"
            :items="preflight.preflight.detected.esosRootPartitions.map(p => ({ value: p.path, label: `${p.path} (${p.label})` }))"
            value-key="value"
            label-key="label"
          />
        </div>

        <p class="text-xs text-gray-500">
          {{ t('raid.missing_tools.plan_token') }} <span class="font-mono">{{ preflight.planToken }}</span>
        </p>
      </div>

      <div class="flex gap-2">
        <UButton size="sm" color="gray" variant="outline" :loading="loadingPreflight" @click="runPreflight">
          {{ t('raid.missing_tools.run_preflight') }}
        </UButton>
      </div>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- D. Temporary install and test -->
    <div v-else-if="step === 3" class="space-y-3">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-heroicons-play"
        :title="t('raid.missing_tools.temp_title') as string"
        :description="t('raid.missing_tools.temp_desc') as string"
      />
      <UButton size="sm" :loading="runningTemp" :disabled="runningTemp" @click="runTempInstall">
        {{ t('raid.missing_tools.run_temp') }}
      </UButton>
      <div v-if="operation" class="space-y-2">
        <p class="text-sm"><strong>{{ t('raid.missing_tools.op_status') }}:</strong> {{ operation.status }}</p>
        <div v-for="s in operation.steps" :key="s.id" class="border border-gray-200 dark:border-gray-700 rounded px-3 py-2">
          <p class="text-xs font-semibold">{{ s.label }} — {{ s.status }}</p>
          <pre v-if="s.stdoutPreview" class="text-xs mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">{{ s.stdoutPreview }}</pre>
          <pre v-if="s.stderrPreview" class="text-xs mt-1 whitespace-pre-wrap text-red-600">{{ s.stderrPreview }}</pre>
        </div>
      </div>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- E. Persistence plan -->
    <div v-else-if="step === 4" class="space-y-3">
      <UAlert
        color="amber"
        variant="subtle"
        icon="i-heroicons-lock-closed"
        :title="t('raid.missing_tools.persist_plan_title') as string"
        :description="t('raid.missing_tools.persist_plan_desc') as string"
      />
      <p v-if="preflight?.confirmationPhrase" class="text-sm text-gray-700 dark:text-gray-300">
        {{ t('raid.missing_tools.confirm_phrase') }} <span class="font-mono font-semibold">{{ preflight.confirmationPhrase }}</span>
      </p>
      <UFormField :label="t('raid.missing_tools.confirm_input') as string">
        <UInput v-model="confirmation" :placeholder="preflight?.confirmationPhrase ?? ''" />
      </UFormField>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- F. Execute persistence -->
    <div v-else-if="step === 5" class="space-y-3">
      <UAlert
        color="amber"
        variant="subtle"
        icon="i-heroicons-bolt"
        :title="t('raid.missing_tools.persist_title') as string"
        :description="t('raid.missing_tools.persist_desc') as string"
      />
      <UButton size="sm" color="amber" :loading="runningPersist" :disabled="runningPersist" @click="runPersist">
        {{ t('raid.missing_tools.run_persist') }}
      </UButton>
      <div v-if="operation" class="space-y-2">
        <p class="text-sm"><strong>{{ t('raid.missing_tools.op_status') }}:</strong> {{ operation.status }}</p>
        <div v-for="s in operation.steps" :key="s.id" class="border border-gray-200 dark:border-gray-700 rounded px-3 py-2">
          <p class="text-xs font-semibold">{{ s.label }} — {{ s.status }}</p>
          <pre v-if="s.stdoutPreview" class="text-xs mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">{{ s.stdoutPreview }}</pre>
          <pre v-if="s.stderrPreview" class="text-xs mt-1 whitespace-pre-wrap text-red-600">{{ s.stderrPreview }}</pre>
        </div>
      </div>
      <p v-if="error" class="text-xs text-red-600">{{ error }}</p>
    </div>

    <!-- G. Reboot required / validation checklist -->
    <div v-else class="space-y-3">
      <UAlert
        color="green"
        variant="subtle"
        icon="i-heroicons-check-circle"
        :title="t('raid.missing_tools.reboot_title') as string"
        :description="t('raid.missing_tools.reboot_desc') as string"
      />
      <ul class="list-disc list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
        <li>{{ t('raid.missing_tools.reboot_item_1') }}</li>
        <li>{{ t('raid.missing_tools.reboot_item_2') }}</li>
        <li>{{ t('raid.missing_tools.reboot_item_3') }}</li>
      </ul>
      <UButton size="sm" color="gray" variant="outline" :loading="loadingReadiness" @click="reloadReadiness">
        {{ t('raid.missing_tools.postcheck') }}
      </UButton>
      <p v-if="readiness?.status === 'ok'" class="text-xs text-gray-500">
        {{ t('raid.missing_tools.tools_now') }} <span class="font-mono">{{ readiness.data.tools.resolvedPath ?? '—' }}</span>
      </p>
    </div>

    <template #footer>
      <div class="flex items-center justify-between gap-2">
        <UButton color="gray" variant="ghost" size="sm" @click="$emit('close')">
          {{ t('common.cancel') }}
        </UButton>
        <div class="flex gap-2">
          <UButton size="sm" color="gray" variant="outline" :disabled="step === 0" @click="step--">
            {{ t('common.back') }}
          </UButton>
          <UButton size="sm" :disabled="!canNext" @click="step++">
            {{ t('common.next') }}
          </UButton>
        </div>
      </div>
    </template>
  </LvmWizardModalShell>
</template>

<script setup lang="ts">
import type { MissingToolsOperation, MissingToolsReadinessResponse } from '~/types/missing-tools'
import LvmWizardModalShell from '~/components/lvm/LvmWizardModalShell.vue'

const props = defineProps<{
  sanId: string
  readOnly?: boolean
}>()

defineEmits<{ close: []; completed: [] }>()

const { t, tError } = useEsosI18n()

const step = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)

const readiness = ref<MissingToolsReadinessResponse | null>(null)
const loadingReadiness = ref(false)

const stagingId = ref<string>('')
const uploading = ref(false)

const preflight = ref<any>(null)
const loadingPreflight = ref(false)
const rootPartition = ref<string>('')
const confirmation = ref('')

const runningTemp = ref(false)
const runningPersist = ref(false)

const operationId = ref<string>('')
const operation = ref<MissingToolsOperation | null>(null)

const error = ref<string>('')

async function reloadReadiness() {
  error.value = ''
  loadingReadiness.value = true
  try {
    readiness.value = await $fetch<MissingToolsReadinessResponse>(`/api/san/${encodeURIComponent(props.sanId)}/missing-tools/readiness`)
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    loadingReadiness.value = false
  }
}

async function uploadRpm() {
  error.value = ''
  const f = fileInput.value?.files?.[0]
  if (!f) {
    error.value = t('raid.missing_tools.err_file_required') as string
    return
  }
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', f, f.name)
    const res = await $fetch<{ stagingId: string }>(`/api/san/${encodeURIComponent(props.sanId)}/missing-tools/upload`, {
      method: 'POST',
      body: form,
    })
    stagingId.value = res.stagingId
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    uploading.value = false
  }
}

async function runPreflight() {
  error.value = ''
  if (!stagingId.value) {
    error.value = t('raid.missing_tools.err_upload_first') as string
    return
  }
  loadingPreflight.value = true
  try {
    preflight.value = await $fetch(
      `/api/san/${encodeURIComponent(props.sanId)}/missing-tools/preflight`,
      {
        method: 'POST',
        body: { stagingId: stagingId.value, ...(rootPartition.value ? { rootPartition: rootPartition.value } : {}) },
      },
    )
    if (preflight.value?.preflight?.detected?.selectedRootPartition) {
      rootPartition.value = preflight.value.preflight.detected.selectedRootPartition
    }
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    loadingPreflight.value = false
  }
}

async function pollOperation(id: string) {
  const op = await $fetch<MissingToolsOperation>(
    `/api/san/${encodeURIComponent(props.sanId)}/missing-tools/operation/${encodeURIComponent(id)}`,
  )
  operation.value = op
  return op
}

async function runTempInstall() {
  error.value = ''
  if (!stagingId.value) {
    error.value = t('raid.missing_tools.err_upload_first') as string
    return
  }
  runningTemp.value = true
  try {
    const res = await $fetch<{ operationId: string }>(
      `/api/san/${encodeURIComponent(props.sanId)}/missing-tools/temp-install`,
      { method: 'POST', body: { stagingId: stagingId.value } },
    )
    operationId.value = res.operationId
    for (let i = 0; i < 60; i++) {
      const op = await pollOperation(operationId.value)
      if (op.status !== 'running' && op.status !== 'planned') break
      await new Promise(r => setTimeout(r, 1000))
    }
    await reloadReadiness()
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    runningTemp.value = false
  }
}

async function runPersist() {
  error.value = ''
  if (!stagingId.value || !preflight.value?.planToken || !rootPartition.value) {
    error.value = t('raid.missing_tools.err_preflight_first') as string
    return
  }
  runningPersist.value = true
  try {
    const res = await $fetch<{ operationId: string }>(
      `/api/san/${encodeURIComponent(props.sanId)}/missing-tools/persist`,
      {
        method: 'POST',
        body: {
          stagingId: stagingId.value,
          rootPartition: rootPartition.value,
          planToken: preflight.value.planToken,
          confirmation: confirmation.value,
        },
      },
    )
    operationId.value = res.operationId
    for (let i = 0; i < 180; i++) {
      const op = await pollOperation(operationId.value)
      if (op.status !== 'running' && op.status !== 'planned') break
      await new Promise(r => setTimeout(r, 1000))
    }
    await reloadReadiness()
  } catch (err: unknown) {
    error.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    runningPersist.value = false
  }
}

const canNext = computed(() => {
  if (step.value === 0) return true
  if (step.value === 1) return Boolean(stagingId.value)
  if (step.value === 2) return Boolean(preflight.value?.preflight?.ok)
  if (step.value === 3) return Boolean(operation.value?.status === 'success')
  if (step.value === 4) return Boolean(confirmation.value.trim())
  if (step.value === 5) return Boolean(operation.value?.status === 'success')
  return true
})

onMounted(() => { void reloadReadiness() })
</script>

