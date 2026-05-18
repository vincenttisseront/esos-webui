<template>
  <div class="max-w-3xl mx-auto space-y-6 p-6">
    <header>
      <h1 class="text-2xl font-bold text-gray-900">{{ t('profile.title') }}</h1>
      <p class="text-sm text-gray-500 mt-1">{{ t('profile.subtitle') }}</p>
    </header>

    <UCard>
      <template #header>
        <div class="flex items-center gap-5">
          <div class="w-14 h-14 rounded-full bg-primary-100 border-2 border-primary-200 flex items-center justify-center shrink-0">
            <span class="text-xl font-bold text-primary-600 uppercase select-none">
              {{ auth.user?.username?.charAt(0) ?? '?' }}
            </span>
          </div>
          <div class="min-w-0">
            <p class="text-lg font-semibold text-gray-900 truncate">{{ auth.user?.username }}</p>
            <div class="flex flex-wrap items-center gap-2 mt-1">
              <UBadge :color="auth.user?.role === 'admin' ? 'blue' : 'gray'" size="xs" variant="subtle">
                {{ auth.user?.role ?? '—' }}
              </UBadge>
              <UBadge color="gray" size="xs" variant="subtle">{{ authSourceLabel }}</UBadge>
              <UBadge :color="auth.user?.active ? 'green' : 'red'" size="xs" variant="subtle">
                {{ auth.user?.active ? t('profile.account.active_yes') : t('profile.account.active_no') }}
              </UBadge>
            </div>
          </div>
        </div>
      </template>

      <div class="divide-y divide-gray-100">
        <div class="py-3 flex items-center justify-between gap-4 text-sm">
          <span class="text-gray-500">{{ t('profile.account.user_id') }}</span>
          <span class="font-mono text-gray-700 text-xs text-right">{{ auth.user?.id ?? '—' }}</span>
        </div>
        <div class="py-3 flex items-center justify-between gap-4 text-sm">
          <span class="text-gray-500">{{ t('profile.account.auth_source') }}</span>
          <span class="text-gray-700 text-right">{{ authSourceLabel }}</span>
        </div>
        <div class="py-3 flex items-center justify-between gap-4 text-sm">
          <span class="text-gray-500">{{ t('profile.account.last_login') }}</span>
          <span class="text-gray-700 text-right">{{ lastLoginFormatted }}</span>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <p class="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <UIcon name="i-heroicons-language" class="w-4 h-4 text-gray-400" />
            {{ t('profile.preferences.title') }}
          </p>
          <p class="text-xs text-gray-500 mt-1">{{ t('profile.preferences.language_help') }}</p>
        </div>
      </template>

      <div class="space-y-4">
        <LanguageSwitcher mode="profile" @persist-error="onLocalePersistError" />
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <p class="text-xs text-gray-400">{{ t('profile.preferences.current_locale') }}</p>
            <p class="font-medium text-gray-800">{{ currentLocaleLabel }}</p>
          </div>
          <div class="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <p class="text-xs text-gray-400">{{ t('profile.preferences.saved_locale') }}</p>
            <p class="font-medium text-gray-800">{{ savedLocaleLabel }}</p>
          </div>
        </div>
        <UAlert
          v-if="localeError"
          color="red"
          variant="soft"
          icon="i-heroicons-exclamation-triangle"
          :title="localeError"
        />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div>
          <p class="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <UIcon name="i-heroicons-lock-closed" class="w-4 h-4 text-gray-400" />
            {{ t('profile.security.title') }}
          </p>
          <p class="text-xs text-gray-500 mt-1">
            {{ isLocalAccount ? t('profile.security.local_help') : t('profile.security.external_title') }}
          </p>
        </div>
      </template>

      <form v-if="isLocalAccount" class="space-y-4" @submit.prevent="onChangePassword">
        <UFormGroup
          :label="t('profile.security.new_password')"
          :hint="t('profile.security.new_password_help')"
          required
          :error="complexityError"
        >
          <UInput v-model="newPassword" type="password" autocomplete="new-password" />
        </UFormGroup>

        <div v-if="newPassword.length > 0" class="grid gap-1.5 text-xs rounded-lg bg-gray-50 border border-gray-100 p-3">
          <div
            v-for="check in localizedChecks"
            :key="check.id"
            class="flex items-center gap-2"
            :class="check.ok ? 'text-green-700' : 'text-gray-400'"
          >
            <UIcon
              :name="check.ok ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
              class="w-4 h-4 shrink-0"
            />
            <span>{{ check.label }}</span>
          </div>
        </div>

        <UFormGroup
          :label="t('profile.security.confirm_password')"
          required
          :error="mismatch ? t('profile.security.mismatch') : undefined"
        >
          <UInput v-model="confirm" type="password" autocomplete="new-password" />
        </UFormGroup>

        <div class="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
          <UButton type="submit" :disabled="!canSubmit || submitting" :loading="submitting">
            {{ t('profile.security.submit') }}
          </UButton>
          <UAlert
            v-if="pwSuccess"
            color="green"
            variant="soft"
            icon="i-heroicons-check-circle"
            :title="t('profile.security.success')"
            class="flex-1 py-2"
          />
          <UAlert v-if="pwError" color="red" variant="soft" :title="pwError" class="flex-1 py-2" />
        </div>
      </form>

      <UAlert
        v-else
        color="blue"
        variant="soft"
        icon="i-heroicons-information-circle"
        :title="externalPasswordTitle"
        :description="externalPasswordMessage"
      />
    </UCard>

    <UCard>
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-gray-800">{{ t('profile.session.title') }}</p>
          <p class="text-xs text-gray-400 mt-0.5">{{ t('profile.session.subtitle') }}</p>
        </div>
        <UButton
          color="red"
          variant="soft"
          icon="i-heroicons-arrow-right-on-rectangle"
          :loading="loggingOut"
          @click="onLogout"
        >
          {{ t('profile.session.logout') }}
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { evaluatePasswordComplexity } from '~/utils/password-policy'

const auth = useAuthStore()
const { t, locale, tError } = useEsosI18n()

onMounted(() => {
  if (!auth.user) auth.fetchMe()
})

const authSource = computed(() => auth.user?.authSource ?? 'local')
const isLocalAccount = computed(() => authSource.value === 'local')
const authSourceLabel = computed(() => t(`profile.account.auth_sources.${authSource.value}`))

const lastLoginFormatted = computed(() => {
  const d = auth.user?.lastLoginAt
  if (!d) return '—'
  return new Date(d).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
})

const currentLocaleLabel = computed(() => t(`languages.${locale.value}`))
const savedLocaleLabel = computed(() => {
  const saved = auth.user?.preferredLocale
  return saved ? t(`languages.${saved}`) : t('profile.preferences.not_saved')
})
const localeError = ref<string | null>(null)

function onLocalePersistError(err: unknown) {
  localeError.value = tError(err as { data?: { code?: string; message?: string }; message?: string }, t('profile.preferences.save_failed'))
}

const newPassword = ref('')
const confirm = ref('')
const pwError = ref<string | null>(null)
const pwSuccess = ref(false)
const submitting = ref(false)

const complexity = computed(() => evaluatePasswordComplexity(newPassword.value))
const localizedChecks = computed(() =>
  complexity.value.checks.map(check => ({
    ...check,
    label: t(`profile.security.policy_checks.${check.id}`),
  })),
)

const complexityError = computed(() => {
  if (!newPassword.value || complexity.value.isValid) return undefined
  return t('profile.security.policy_error')
})

const mismatch = computed(() => confirm.value.length > 0 && confirm.value !== newPassword.value)
const canSubmit = computed(() => isLocalAccount.value && complexity.value.isValid && newPassword.value === confirm.value)

const externalPasswordTitle = computed(() => t('profile.security.external_title'))
const externalPasswordMessage = computed(() => {
  if (authSource.value === 'ldap') return t('profile.security.external_ldap')
  if (authSource.value === 'oidc') return t('profile.security.external_oidc')
  return t('profile.security.external_unknown')
})

async function onChangePassword() {
  if (!isLocalAccount.value) return
  pwError.value = null
  pwSuccess.value = false
  submitting.value = true
  try {
    await auth.changePassword(newPassword.value)
    pwSuccess.value = true
    newPassword.value = ''
    confirm.value = ''
    setTimeout(() => { pwSuccess.value = false }, 4_000)
  } catch (err: unknown) {
    pwError.value = tError(err as { data?: { code?: string; message?: string }; message?: string })
  } finally {
    submitting.value = false
  }
}

const loggingOut = ref(false)

async function onLogout() {
  loggingOut.value = true
  await auth.logout()
}
</script>
