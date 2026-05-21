<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-server" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">{{ t('admin.sysconfig.hostname.title') }}</span>
      </div>
    </template>

    <div class="space-y-4">
      <UFormField :label="t('admin.sysconfig.hostname.hostname') as string" :error="errors.hostname">
        <UInput v-model="form.hostname" placeholder="san01" :disabled="isDisabled" />
      </UFormField>

      <UFormField :label="t('admin.sysconfig.hostname.domain') as string" :error="errors.domain">
        <UInput v-model="form.domain" placeholder="example.com" :disabled="isDisabled" />
      </UFormField>

      <div class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-600">
        {{ t('admin.sysconfig.hostname.fqdn') }} :
        <span class="font-mono font-semibold text-gray-800">{{ fqdn || '—' }}</span>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          :label="t('admin.sysconfig.hostname.save') as string"
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
import type { HostnameConfig } from '~/server/utils/types'
import { useAppToast } from '~/composables/useAppToast'

const { t, tError } = useEsosI18n()

const props = defineProps<{
  sanId:    string
  config:   HostnameConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: [value: HostnameConfig]
}>()

const toast = useAppToast()

const form = reactive({
  hostname: props.config.hostname,
  domain:   props.config.domain,
})

const errors = reactive({ hostname: '', domain: '' })
const saving = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

const fqdn = computed(() =>
  form.domain ? `${form.hostname}.${form.domain}` : form.hostname,
)

const dirty = computed(() =>
  form.hostname !== props.config.hostname ||
  form.domain   !== props.config.domain,
)

function validate(): boolean {
  errors.hostname = ''
  errors.domain   = ''
  if (!form.hostname) {
    errors.hostname = t('admin.sysconfig.hostname.err_required') as string
    return false
  }
  if (!/^[a-zA-Z0-9-]+$/.test(form.hostname)) {
    errors.hostname = t('admin.sysconfig.hostname.err_hostname_chars') as string
    return false
  }
  if (form.domain && !/^[a-zA-Z0-9.-]+$/.test(form.domain)) {
    errors.domain = t('admin.sysconfig.hostname.err_domain') as string
    return false
  }
  return true
}

async function save() {
  if (!validate()) return
  saving.value = true
  try {
    const result = await $fetch<HostnameConfig>(
      `/api/san/${props.sanId}/system-config/hostname`,
      { method: 'PATCH', body: { hostname: form.hostname, domain: form.domain } },
    )
    toast.success(
      t('admin.sysconfig.hostname.toast_ok') as string,
      `${t('admin.sysconfig.hostname.fqdn') as string} : ${result.fqdn}`,
    )
    emit('saved', result)
  } catch (err: unknown) {
    toast.error(t('admin.sysconfig.hostname.toast_fail') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    saving.value = false
  }
}
</script>
