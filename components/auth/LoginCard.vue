<template>
  <section
    class="w-full max-w-lg rounded-[24px] border border-[#D8E2EE] dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:px-8 sm:py-8"
    :aria-label="t('auth.login.card_label')"
  >
    <div
      v-if="availableModes.length > 1"
      class="relative mb-7 rounded-full border border-slate-200 dark:border-gray-600 bg-slate-100 dark:bg-gray-800 p-1"
      role="tablist"
      :aria-label="t('auth.login.mode_selector_label')"
      @keydown="onTablistKeydown"
    >
      <div
        class="pointer-events-none absolute top-1 bottom-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md shadow-blue-900/20 transition-[left,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        :style="pillStyle"
      />
      <div
        class="relative z-10 grid"
        :style="{ gridTemplateColumns: `repeat(${availableModes.length}, minmax(0, 1fr))` }"
      >
        <button
          v-for="mode in availableModes"
          :id="tabId(mode.id)"
          :key="mode.id"
          type="button"
          role="tab"
          class="flex min-h-11 items-center justify-center gap-1.5 rounded-full px-2 text-center text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 sm:text-sm"
          :class="tabClass(mode)"
          :aria-selected="activeMode === mode.id"
          :tabindex="activeMode === mode.id ? 0 : -1"
          :aria-controls="panelId(mode.id)"
          @click="selectMode(mode.id)"
        >
          <UIcon :name="modeIcon(mode.id)" class="hidden h-3.5 w-3.5 sm:inline-block" aria-hidden="true" />
          {{ mode.label }}
        </button>
      </div>
    </div>

    <div v-if="availableModes.length > 0" class="mb-7 flex justify-center">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl border shadow-inner"
        :class="activeMode === 'oidc'
          ? 'border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/50 dark:to-blue-950/40'
          : 'border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30'"
        aria-hidden="true"
      >
        <UIcon
          :name="activeIcon"
          class="h-8 w-8"
          :class="activeMode === 'oidc' ? 'text-indigo-700 dark:text-indigo-300' : 'text-blue-700 dark:text-blue-300'"
        />
      </div>
    </div>

    <Transition
      enter-active-class="transition-all duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="error"
        class="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3.5 py-3 text-sm text-red-700 dark:text-red-300"
        role="alert"
      >
        <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        {{ error }}
      </div>
    </Transition>

    <div
      v-if="availableModes.length === 0"
      class="space-y-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-5 text-center"
      role="alert"
    >
      <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-8 w-8 text-amber-600 dark:text-amber-400" />
      <h2 class="text-lg font-semibold text-amber-950 dark:text-amber-100">
        {{ t('auth.login.no_methods_title') }}
      </h2>
      <p class="text-sm leading-6 text-amber-800 dark:text-amber-200">
        {{ t('auth.login.no_methods_help') }}
      </p>
    </div>

    <div v-else class="relative min-h-[18.5rem]">
      <Transition
        mode="out-in"
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <form
          v-if="activeMode === 'local'"
          :id="panelId('local')"
          key="local"
          :class="formFieldStackClass"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('local') : undefined"
          autocomplete="on"
          @submit.prevent="emit('submit-local')"
        >
          <div class="space-y-1.5">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-gray-100">
              {{ t('auth.login.local_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500 dark:text-gray-400">
              {{ t('auth.login.local_help') }}
            </p>
          </div>

          <AppFormField :label="t('auth.login.local_username_label')">
            <AppTextInput
              v-model="username"
              name="username"
              type="text"
              :placeholder="t('auth.login.local_username_placeholder')"
              autocomplete="username"
              :loading="submitting"
              autofocus
            />
          </AppFormField>

          <AppFormField :label="t('auth.login.local_password_label')">
            <AppTextInput
              v-model="password"
              name="password"
              type="password"
              :placeholder="t('auth.login.local_password_placeholder')"
              autocomplete="current-password"
              :loading="submitting"
            />
          </AppFormField>

          <div class="flex justify-end pt-0.5">
            <button
              type="button"
              class="rounded text-sm font-medium text-blue-700 dark:text-blue-400 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-300 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50"
              :disabled="submitting"
              @click="emit('forgot-password')"
            >
              {{ t('auth.login.forgot_password') }}
            </button>
          </div>

          <UButton
            type="submit"
            block
            size="lg"
            :loading="submitting"
            :disabled="!username?.trim() || !password"
            class="h-12 justify-center bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-lg shadow-blue-900/20 hover:from-blue-700 hover:to-indigo-700"
          >
            {{ t('auth.login.local_submit') }}
          </UButton>

          <button
            v-if="hasOidc"
            type="button"
            class="w-full text-center text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            @click="selectMode('oidc')"
          >
            {{ t('auth.login.switch_to_sso') }}
          </button>
        </form>

        <form
          v-else-if="activeMode === 'ldap'"
          :id="panelId('ldap')"
          key="ldap"
          :class="formFieldStackClass"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('ldap') : undefined"
          autocomplete="on"
          @submit.prevent="emit('ldap-submit')"
        >
          <div class="space-y-1.5">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-gray-100">
              {{ t('auth.login.ldap_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500 dark:text-gray-400">
              {{ t('auth.login.ldap_help') }}
            </p>
          </div>

          <AppFormField :label="t('auth.login.ldap_username_label')">
            <AppTextInput
              v-model="ldapUsername"
              name="username"
              type="text"
              :placeholder="t('auth.login.ldap_username_placeholder')"
              autocomplete="username"
              :loading="ldapSubmitting"
              autofocus
            />
          </AppFormField>

          <AppFormField :label="t('auth.login.ldap_password_label')">
            <AppTextInput
              v-model="ldapPassword"
              name="password"
              type="password"
              :placeholder="t('auth.login.ldap_password_placeholder')"
              autocomplete="current-password"
              :loading="ldapSubmitting"
            />
          </AppFormField>

          <UButton
            type="submit"
            block
            size="lg"
            :loading="ldapSubmitting"
            :disabled="!ldapUsername?.trim() || !ldapPassword"
            class="h-12 justify-center bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-lg shadow-blue-900/20 hover:from-blue-700 hover:to-indigo-700"
          >
            {{ t('auth.login.ldap_submit') }}
          </UButton>

          <button
            v-if="hasOidc"
            type="button"
            class="w-full text-center text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
            @click="selectMode('oidc')"
          >
            {{ t('auth.login.switch_to_sso') }}
          </button>
        </form>

        <div
          v-else-if="activeMode === 'oidc'"
          :id="panelId('oidc')"
          key="oidc"
          class="space-y-6"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('oidc') : undefined"
        >
          <div class="space-y-1.5 text-center">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-gray-100">
              {{ t('auth.login.sso_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500 dark:text-gray-400">
              {{ t('auth.login.sso_help') }}
            </p>
          </div>

          <div class="rounded-2xl border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50/80 to-slate-50 dark:from-indigo-950/40 dark:to-gray-900/60 px-5 py-5 text-center">
            <div class="mb-3 flex justify-center">
              <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-800 shadow-sm">
                <UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
              </div>
            </div>
            <p class="text-sm font-medium text-slate-800 dark:text-gray-100">
              {{ t('auth.login.sso_provider_generic') }}
            </p>
            <p class="mt-1.5 text-xs leading-5 text-slate-500 dark:text-gray-400">
              {{ t('auth.login.sso_redirect_note') }}
            </p>
          </div>

          <UButton
            type="button"
            block
            size="lg"
            icon="i-heroicons-arrow-right-on-rectangle"
            :loading="ssoRedirecting"
            class="h-12 justify-center bg-gradient-to-r from-indigo-600 to-blue-600 font-semibold shadow-lg shadow-indigo-900/25 hover:from-indigo-700 hover:to-blue-700"
            @click="onSsoClick"
          >
            {{ t('auth.login.sso_submit') }}
          </UButton>

          <p class="text-center text-xs text-slate-400 dark:text-gray-500">
            {{ t('auth.login.sso_secure_note') }}
          </p>
        </div>
      </Transition>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formFieldStackClass } from '~/utils/form-field-styles'

type ModeId = 'local' | 'ldap' | 'oidc'

export type LoginProviderOption = {
  key: ModeId
  label: string
  loginUrl?: string
}

const { t } = useEsosI18n()

const props = withDefaults(
  defineProps<{
    providers?: LoginProviderOption[]
    defaultProvider?: ModeId
    submitting?: boolean
    ldapSubmitting?: boolean
    error?: string | null
  }>(),
  {
    providers: () => [],
    defaultProvider: 'local',
    submitting: false,
    ldapSubmitting: false,
    error: null,
  },
)

const emit = defineEmits<{
  'submit-local': []
  'ldap-submit': []
  sso: []
  'forgot-password': []
  'clear-error': []
}>()

const username = defineModel<string>('username', { required: true })
const password = defineModel<string>('password', { required: true })
const ldapUsername = defineModel<string>('ldapUsername', { default: '' })
const ldapPassword = defineModel<string>('ldapPassword', { default: '' })

const ssoRedirecting = ref(false)

const tabLabelKeys: Record<ModeId, string> = {
  local: 'auth.login.tab_local',
  ldap:  'auth.login.tab_ldap',
  oidc:  'auth.login.tab_sso',
}

const availableModes = computed(() =>
  props.providers.map((p) => ({
    id:       p.key,
    label:    t(tabLabelKeys[p.key]) as string,
    loginUrl: p.loginUrl,
  })),
)

const hasOidc = computed(() => availableModes.value.some((m) => m.id === 'oidc'))

const activeMode = ref<ModeId>('local')
const userPickedMode = ref(false)

watch(
  () => [props.providers, props.defaultProvider] as const,
  () => {
    const ids = availableModes.value.map((m) => m.id)
    if (ids.length === 0) return
    const preferred = props.defaultProvider && ids.includes(props.defaultProvider)
      ? props.defaultProvider
      : ids[0]!
    if (!userPickedMode.value || !ids.includes(activeMode.value)) {
      activeMode.value = preferred
    }
  },
  { immediate: true },
)

const activeIndex = computed(() =>
  availableModes.value.findIndex((mode) => mode.id === activeMode.value),
)

const pillStyle = computed(() => {
  const n = availableModes.value.length
  if (n <= 1) return {}
  const idx = Math.max(0, activeIndex.value)
  return {
    width: `calc((100% - 0.5rem) / ${n})`,
    left:  `calc(0.25rem + (100% - 0.5rem) * ${idx} / ${n})`,
  }
})

function modeIcon(id: ModeId) {
  switch (id) {
    case 'ldap':
      return 'i-heroicons-server-stack'
    case 'oidc':
      return 'i-heroicons-shield-check'
    default:
      return 'i-heroicons-key'
  }
}

const activeIcon = computed(() => modeIcon(activeMode.value))

const oidcLoginUrl = computed(() =>
  props.providers.find((p) => p.key === 'oidc')?.loginUrl ?? '/api/auth/oidc/login',
)

function tabId(id: ModeId) {
  return `login-tab-${id}`
}

function panelId(id: ModeId) {
  return `login-panel-${id}`
}

function tabClass(mode: { id: ModeId }) {
  return activeMode.value === mode.id
    ? 'text-white'
    : 'text-slate-600 dark:text-gray-300 hover:text-slate-950 dark:hover:text-white'
}

function selectMode(id: ModeId) {
  if (availableModes.value.some((m) => m.id === id)) {
    if (activeMode.value !== id) {
      userPickedMode.value = true
      activeMode.value = id
      emit('clear-error')
    }
  }
}

function onTablistKeydown(e: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()

  const ids = availableModes.value.map((mode) => mode.id)
  const current = ids.indexOf(activeMode.value)
  if (current < 0) return

  let next = current
  if (e.key === 'ArrowRight') next = (current + 1) % ids.length
  if (e.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length
  if (e.key === 'Home') next = 0
  if (e.key === 'End') next = ids.length - 1

  if (ids[next] !== activeMode.value) {
    userPickedMode.value = true
    activeMode.value = ids[next]!
    emit('clear-error')
  }
  ;(document.getElementById(tabId(ids[next]!)) as HTMLButtonElement | null)?.focus()
}

function onSsoClick() {
  ssoRedirecting.value = true
  emit('sso')
  window.location.href = oidcLoginUrl.value
}
</script>
