<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-keyboard" class="text-gray-500 dark:text-gray-400 size-5" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ t('admin.sysconfig.keymap.title') }}</span>
      </div>
    </template>

    <div class="space-y-4">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-heroicons-information-circle"
        :title="t('admin.sysconfig.keymap.subtitle') as string"
      />

      <div v-if="loading" class="flex justify-center py-6">
        <UIcon name="i-heroicons-arrow-path" class="size-6 text-gray-400 animate-spin" />
      </div>

      <div v-else class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div class="space-y-1">
            <p class="text-xs font-medium text-gray-400 uppercase tracking-wide">
              {{ t('admin.sysconfig.keymap.current') }}
            </p>
            <p class="font-mono text-sm text-gray-800 dark:text-gray-100">
              {{ currentLabel }}
            </p>
          </div>

          <AppFormField :label="t('admin.sysconfig.keymap.select_label') as string">
            <USelectMenu
              v-model="selectedKeymap"
              :items="items"
              value-key="value"
              label-key="label"
              :loading="loading"
              :placeholder="t('admin.sysconfig.keymap.select_placeholder') as string"
              :disabled="isDisabled || items.length === 0"
              :search-input="{ placeholder: t('admin.sysconfig.keymap.select_search') as string }"
              class="w-full"
            />
          </AppFormField>
        </div>

        <p
          v-if="status === 'ok' && info.usingFallback"
          class="text-xs text-blue-700 dark:text-blue-300"
        >
          {{ t('admin.sysconfig.keymap.fallback_list_hint') }}
        </p>

        <div class="flex flex-col sm:flex-row gap-3">
          <UButton
            :label="t('admin.sysconfig.keymap.test') as string"
            icon="i-heroicons-play"
            color="gray"
            variant="outline"
            :loading="testing"
            :disabled="!canSubmit || testing"
            class="flex-1"
            @click="onTest"
          />

          <UButton
            :label="t('admin.sysconfig.keymap.save') as string"
            icon="i-heroicons-check"
            :loading="saving"
            :disabled="!canSubmit || saving"
            class="flex-1"
            @click="onSave"
          />
        </div>

        <p class="text-xs text-gray-400">
          {{ t('admin.sysconfig.keymap.test_hint') }}
        </p>

        <p v-if="status === 'unavailable'" class="text-xs text-red-600">
          {{ errorMessage }}
        </p>
        <p v-else-if="status === 'ok' && !info.loadkeysPresent" class="text-xs text-amber-700 dark:text-amber-300">
          {{ t('admin.sysconfig.keymap.loadkeys_missing') }}
        </p>
        <p
          v-else-if="status === 'ok' && info.detectedCount === 0 && !info.usingFallback"
          class="text-xs text-amber-700 dark:text-amber-300"
        >
          {{ t('admin.sysconfig.keymap.no_keymaps') }}
        </p>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { useAppToast } from '~/composables/useAppToast'

type ConsoleKeymapInfo = {
  current: { id: string } | null
  available: Array<{ id: string; label: string; source?: string }>
  loadkeysPresent: boolean
  rcKeymapPresent: boolean
  usingFallback: boolean
  detectedCount: number
}

type ConsoleKeymapStatus =
  | { status: 'ok'; data: ConsoleKeymapInfo }
  | { status: 'unavailable'; error: { code: string; message: string } }

const props = defineProps<{
  sanId: string
  disabled?: boolean
}>()

const { t, tError } = useEsosI18n()
const toast = useAppToast()

const loading = ref(false)
const status = ref<ConsoleKeymapStatus['status']>('unavailable')
const info = reactive<ConsoleKeymapInfo>({
  current: null,
  available: [],
  loadkeysPresent: false,
  rcKeymapPresent: false,
  usingFallback: false,
  detectedCount: 0,
})
const errorMessage = ref<string>('')

const selectedKeymap = ref<string | null>(null)
const testing = ref(false)
const saving = ref(false)

const isDisabled = computed(() => Boolean(props.disabled) || testing.value || saving.value || loading.value)

const items = computed(() =>
  info.available.map(k => ({ value: k.id, label: k.label })),
)

const currentLabel = computed(() => info.current?.id ?? (t('admin.sysconfig.keymap.current_unknown') as string))

const canSubmit = computed(() => {
  if (isDisabled.value || status.value !== 'ok' || !info.loadkeysPresent) return false
  const sel = selectedKeymap.value?.trim()
  if (!sel) return false
  return items.value.some(i => i.value === sel)
})

function resetState() {
  status.value = 'unavailable'
  info.current = null
  info.available = []
  info.loadkeysPresent = false
  info.rcKeymapPresent = false
  info.usingFallback = false
  info.detectedCount = 0
  selectedKeymap.value = null
  errorMessage.value = ''
}

async function reload() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await $fetch<ConsoleKeymapStatus>(`/api/san/${encodeURIComponent(props.sanId)}/system-config/keymap`)
    status.value = res.status
    if (res.status === 'ok') {
      info.current = res.data.current
      info.available = res.data.available
      info.loadkeysPresent = res.data.loadkeysPresent
      info.rcKeymapPresent = res.data.rcKeymapPresent
      info.usingFallback = res.data.usingFallback
      info.detectedCount = res.data.detectedCount

      const ids = new Set(res.data.available.map(k => k.id))
      const currentId = res.data.current?.id
      if (currentId && ids.has(currentId)) {
        selectedKeymap.value = currentId
      } else if (selectedKeymap.value && ids.has(selectedKeymap.value)) {
        // keep user selection
      } else if (res.data.available.length > 0) {
        selectedKeymap.value = res.data.available[0]!.id
      } else {
        selectedKeymap.value = null
      }
    } else {
      errorMessage.value = res.error.message
    }
  } catch (err: unknown) {
    status.value = 'unavailable'
    errorMessage.value = tError(err as Parameters<typeof tError>[0])
  } finally {
    loading.value = false
  }
}

async function onTest() {
  if (!selectedKeymap.value) return
  testing.value = true
  try {
    await $fetch(`/api/san/${encodeURIComponent(props.sanId)}/system-config/keymap/test`, {
      method: 'POST',
      body: { keymap: selectedKeymap.value },
    })
    toast.success(t('admin.sysconfig.keymap.test_success') as string)
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    testing.value = false
  }
}

async function onSave() {
  if (!selectedKeymap.value) return
  saving.value = true
  try {
    await $fetch(`/api/san/${encodeURIComponent(props.sanId)}/system-config/keymap`, {
      method: 'PATCH',
      body: { keymap: selectedKeymap.value },
    })
    toast.success(t('admin.sysconfig.keymap.save_success') as string)
    await reload()
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    saving.value = false
  }
}

watch(() => props.sanId, () => {
  resetState()
  void reload()
}, { immediate: true })
</script>
