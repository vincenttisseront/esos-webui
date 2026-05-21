<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-clock" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">{{ t('admin.sysconfig.datetime.title') }}</span>
      </div>
    </template>

    <div class="space-y-5">
      <!-- System time (client-formatted to avoid SSR/locale drift) -->
      <div class="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-2">
        <div v-if="!timeDisplayReady" class="text-sm text-slate-400">
          —
        </div>
        <template v-else>
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">
              {{ t('admin.sysconfig.datetime.local_time_label') }}
            </p>
            <p class="mt-1 text-sm font-medium text-slate-900 tabular-nums">
              {{ timeDisplay.localMain }}
            </p>
          </div>
          <div v-if="timeDisplay.utcSecondary">
            <p class="text-xs text-slate-500">
              {{ t('admin.sysconfig.datetime.utc_time_label') }}
            </p>
            <p class="text-xs text-slate-600 tabular-nums font-mono">
              {{ timeDisplay.utcSecondary }}
            </p>
          </div>
        </template>
      </div>

      <AppFormField :label="t('admin.sysconfig.datetime.timezone_label')">
        <USelectMenu
          v-model="form.timezone"
          :items="tzList"
          :loading="tzLoading"
          :placeholder="tzLoading ? t('admin.sysconfig.datetime.timezone_loading') : t('admin.sysconfig.datetime.timezone_placeholder')"
          :disabled="isDisabled"
          :search-input="{ placeholder: t('admin.sysconfig.datetime.timezone_search') }"
          class="w-full"
        />
      </AppFormField>

      <AppFormField :label="t('admin.sysconfig.datetime.ntp_servers_label')">
        <div class="flex flex-col gap-3">
          <div
            v-for="(_server, idx) in form.ntpServers"
            :key="idx"
            class="flex items-center gap-2"
          >
            <AppTextInput
              v-model="form.ntpServers[idx]!"
              placeholder="pool.ntp.org"
              class="flex-1"
              :disabled="isDisabled"
            />
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="sm"
              :disabled="isDisabled || form.ntpServers.length <= 1"
              @click="removeServer(idx)"
            />
          </div>
          <UButton
            :label="t('admin.sysconfig.datetime.ntp_add_server')"
            icon="i-heroicons-plus"
            variant="outline"
            size="sm"
            :disabled="isDisabled"
            @click="addServer"
          />
        </div>
      </AppFormField>

      <div v-if="config.ntpRunning !== undefined" class="flex items-center gap-2 text-sm">
        <span
          class="size-2 rounded-full shrink-0"
          :class="config.ntpRunning ? 'bg-green-500' : 'bg-gray-400'"
        />
        <span class="text-gray-500">
          {{ config.ntpRunning ? t('admin.sysconfig.datetime.ntp_running') : t('admin.sysconfig.datetime.ntp_stopped') }}
        </span>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          :label="t('admin.sysconfig.datetime.save')"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="!dirty || props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { DateTimeConfig } from '~/server/utils/types'
import { useAppToast } from '~/composables/useAppToast'
import { formatSystemDateTimeDisplay } from '~/utils/system-datetime-display'

const props = defineProps<{
  sanId:    string
  config:   DateTimeConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: []
}>()

const { t, locale } = useEsosI18n()
const toast = useAppToast()

const form = reactive({
  timezone:   props.config.timezone,
  ntpServers: [...(props.config.ntpServers.length ? props.config.ntpServers : [''])],
})

const tzList    = ref<string[]>([])
const tzLoading = ref(false)

const timeDisplayReady = ref(false)
const timeDisplay = computed(() =>
  formatSystemDateTimeDisplay({
    currentTimeUtc: props.config.currentTime,
    timezone:       form.timezone || props.config.timezone,
    locale:         locale.value,
    utcFallbackLabel: t('admin.sysconfig.datetime.utc_fallback') as string,
  }),
)

onMounted(async () => {
  timeDisplayReady.value = true
  tzLoading.value = true
  try {
    const { timezones } = await $fetch<{ timezones: string[] }>(
      `/api/san/${props.sanId}/system-config/timezones`,
    )
    tzList.value = timezones
  } catch { /* SSH unavailable — free text via select empty */ }
  finally { tzLoading.value = false }
})

const saving = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

const dirty = computed(() =>
  form.timezone !== props.config.timezone ||
  JSON.stringify(form.ntpServers) !== JSON.stringify(props.config.ntpServers),
)

function addServer() { form.ntpServers.push('') }
function removeServer(i: number) { form.ntpServers.splice(i, 1) }

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/datetime`, {
      method: 'PATCH',
      body: {
        timezone:   form.timezone,
        ntpServers: form.ntpServers.filter(Boolean),
      },
    })
    toast.success(t('admin.sysconfig.datetime.save_success') as string)
    emit('saved')
  } catch (err: unknown) {
    const e = err as { data?: { message?: string }; message?: string }
    toast.error(t('admin.sysconfig.datetime.save_error') as string, e?.data?.message ?? e?.message ?? String(err))
  } finally {
    saving.value = false
  }
}
</script>
