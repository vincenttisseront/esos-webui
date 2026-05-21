<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-envelope" class="text-gray-500 dark:text-gray-400 size-5" />
        <span class="font-semibold text-gray-800 dark:text-gray-200">{{ t('admin.sysconfig.smtp.title') }}</span>
      </div>
    </template>

    <div class="space-y-6">

      <!-- Serveur -->
      <div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{{ t('admin.sysconfig.smtp.section_server') }}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField
            :label="t('admin.sysconfig.smtp.alert_email') as string"
            :hint="t('admin.sysconfig.smtp.alert_email_hint') as string"
          >
            <UInput v-model="form.alertEmail" placeholder="alerts@example.com" class="w-full" :disabled="isDisabled" />
          </UFormField>

          <UFormField
            :label="t('admin.sysconfig.smtp.mail_hub') as string"
            :hint="t('admin.sysconfig.smtp.mail_hub_hint') as string"
          >
            <UInput v-model="form.mailHub" placeholder="smtp.example.com:587" class="w-full" :disabled="isDisabled" />
          </UFormField>
        </div>
      </div>

      <!-- Authentification -->
      <div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{{ t('admin.sysconfig.smtp.section_auth') }}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField :label="t('admin.sysconfig.smtp.auth_user') as string">
            <UInput v-model="form.authUser" placeholder="user@example.com" class="w-full" :disabled="isDisabled" />
          </UFormField>

          <UFormField :label="t('admin.sysconfig.smtp.auth_pass') as string">
            <UInput
              v-model="form.authPass"
              type="password"
              :placeholder="t('admin.sysconfig.smtp.auth_pass_placeholder') as string"
              class="w-full"
              :disabled="isDisabled"
            />
          </UFormField>

          <UFormField :label="t('admin.sysconfig.smtp.auth_method') as string">
            <USelect
              v-model="form.authMethod"
              :items="authMethods"
              value-key="value"
              class="w-full"
              :disabled="isDisabled"
            />
          </UFormField>
        </div>
      </div>

      <!-- Chiffrement & options -->
      <div>
        <p class="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">{{ t('admin.sysconfig.smtp.section_tls') }}</p>
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          <label class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" :class="{ 'opacity-50 pointer-events-none': isDisabled }">
            <div>
              <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ t('admin.sysconfig.smtp.tls') }}</p>
              <p class="text-xs text-gray-400">{{ t('admin.sysconfig.smtp.tls_hint') }}</p>
            </div>
            <UToggle v-model="form.useTLS" :disabled="isDisabled" />
          </label>
          <label class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" :class="{ 'opacity-50 pointer-events-none': isDisabled }">
            <div>
              <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ t('admin.sysconfig.smtp.starttls') }}</p>
              <p class="text-xs text-gray-400">{{ t('admin.sysconfig.smtp.starttls_hint') }}</p>
            </div>
            <UToggle v-model="form.useSTARTTLS" :disabled="isDisabled" />
          </label>
          <label class="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" :class="{ 'opacity-50 pointer-events-none': isDisabled }">
            <div>
              <p class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ t('admin.sysconfig.smtp.from_override') }}</p>
              <p class="text-xs text-gray-400">{{ t('admin.sysconfig.smtp.from_override_hint') }}</p>
            </div>
            <UToggle v-model="form.fromOverride" :disabled="isDisabled" />
          </label>
        </div>
      </div>

      <!-- Résultat du test -->
      <div v-if="testResult !== null">
        <UAlert
          :color="testResult.ok ? 'green' : 'red'"
          :icon="testResult.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
          :title="(testResult.ok ? t('admin.sysconfig.smtp.test_ok') : t('admin.sysconfig.smtp.test_fail')) as string"
          :description="testResult.ok ? (t('admin.sysconfig.smtp.test_recipient', { recipient: testResult.recipient }) as string) : testResult.error"
          variant="subtle"
        />
      </div>

    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <UButton
          :label="t('admin.sysconfig.smtp.send_test') as string"
          icon="i-heroicons-paper-airplane"
          variant="outline"
          color="gray"
          :loading="testing"
          :disabled="props.disabled || saving || testing"
          @click="sendTest"
        />
        <UButton
          :label="t('common.actions.save') as string"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { SMTPConfig } from '~/server/utils/types'
import { useAppToast } from '~/composables/useAppToast'
import {
  smtpAuthMethodSelectItems,
  toBackendSmtpAuthMethod,
  toUiSmtpAuthMethod,
  type SmtpAuthMethodUi,
} from '~/utils/smtp-auth-method'

const props = defineProps<{
  sanId:    string
  config:   Omit<SMTPConfig, 'authPass'>
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: []
}>()

const toast = useAppToast()

const { t, tError } = useEsosI18n()

const authMethods = computed(() =>
  smtpAuthMethodSelectItems({
    none:  t('admin.sysconfig.smtp.auth_none') as string,
    login: 'LOGIN',
    plain: 'PLAIN',
    cram:  'CRAM-MD5',
  }),
)

const form = reactive({
  alertEmail:   props.config.alertEmail,
  mailHub:      props.config.mailHub,
  authUser:     props.config.authUser,
  authPass:     '',
  useTLS:       props.config.useTLS,
  useSTARTTLS:  props.config.useSTARTTLS,
  authMethod:   toUiSmtpAuthMethod(props.config.authMethod) as SmtpAuthMethodUi,
  fromOverride: props.config.fromOverride,
})

const saving     = ref(false)
const testing    = ref(false)
const testResult = ref<{ ok: boolean; recipient?: string; error?: string } | null>(null)

const isDisabled = computed(() => props.disabled || saving.value)

async function save() {
  saving.value     = true
  testResult.value = null
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/smtp`, {
      method: 'PATCH',
      body: {
        ...form,
        authMethod: toBackendSmtpAuthMethod(form.authMethod),
      },
    })
    toast.success(t('admin.sysconfig.smtp.toast_saved') as string)
    emit('saved')
  } catch (err: unknown) {
    toast.error(t('common.failure') as string, tError(err as Parameters<typeof tError>[0]))
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value    = true
  testResult.value = null
  try {
    const result = await $fetch<{ ok: boolean; recipient?: string; error?: string }>(
      `/api/san/${props.sanId}/system-config/smtp/test`,
      { method: 'POST' }
    )
    testResult.value = result
  } catch (err: unknown) {
    const e = err as { data?: { error?: string; message?: string }; message?: string }
    testResult.value = { ok: false, error: e?.data?.error ?? e?.data?.message ?? e?.message ?? String(err) }
  } finally {
    testing.value = false
  }
}
</script>
