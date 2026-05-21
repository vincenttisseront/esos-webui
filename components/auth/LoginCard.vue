<template>
  <section
    class="w-full max-w-lg rounded-[24px] border border-[#D8E2EE] bg-white px-6 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:px-8 sm:py-8"
    :aria-label="t('auth.login.card_label')"
  >
    <div
      v-if="availableModes.length > 1"
      class="relative mb-7 rounded-full border border-slate-200 bg-slate-100 p-1"
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
          class="min-h-11 rounded-full px-2 text-center text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 sm:text-sm"
          :class="tabClass(mode)"
          :aria-selected="activeMode === mode.id"
          :tabindex="activeMode === mode.id ? 0 : -1"
          :aria-controls="panelId(mode.id)"
          @click="selectMode(mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <div v-if="availableModes.length > 0" class="mb-7 flex justify-center">
      <div
        class="flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-inner"
        aria-hidden="true"
      >
        <UIcon :name="activeIcon" class="h-8 w-8 text-blue-700" />
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
        class="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
        role="alert"
      >
        <UIcon name="i-heroicons-exclamation-circle" class="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        {{ error }}
      </div>
    </Transition>

    <div
      v-if="availableModes.length === 0"
      class="space-y-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center"
      role="alert"
    >
      <UIcon name="i-heroicons-exclamation-triangle" class="mx-auto h-8 w-8 text-amber-600" />
      <h2 class="text-lg font-semibold text-amber-950">
        {{ t('auth.login.no_methods_title') }}
      </h2>
      <p class="text-sm leading-6 text-amber-800">
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
          class="space-y-5"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('local') : undefined"
          autocomplete="on"
          @submit.prevent="emit('submit-local')"
        >
          <div class="space-y-1.5">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950">
              {{ t('auth.login.local_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500">
              {{ t('auth.login.local_help') }}
            </p>
          </div>

          <UFormGroup :label="t('auth.login.local_username_label')">
            <UInput
              v-model="username"
              name="username"
              type="text"
              :placeholder="t('auth.login.local_username_placeholder')"
              autocomplete="username"
              size="lg"
              class="w-full"
              :ui="inputUi"
              :disabled="submitting"
              autofocus
            />
          </UFormGroup>

          <UFormGroup :label="t('auth.login.password')">
            <UInput
              v-model="password"
              name="password"
              type="password"
              :placeholder="t('auth.login.local_password_placeholder')"
              autocomplete="current-password"
              size="lg"
              class="w-full"
              :ui="inputUi"
              :disabled="submitting"
            />
          </UFormGroup>

          <div class="flex justify-end">
            <button
              type="button"
              class="rounded text-sm font-medium text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:opacity-50"
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
        </form>

        <form
          v-else-if="activeMode === 'ldap'"
          :id="panelId('ldap')"
          key="ldap"
          class="space-y-5"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('ldap') : undefined"
          autocomplete="on"
          @submit.prevent="emit('ldap-submit')"
        >
          <div class="space-y-1.5">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950">
              {{ t('auth.login.ldap_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500">
              {{ t('auth.login.ldap_help') }}
            </p>
          </div>

          <UFormGroup :label="t('auth.login.ldap_username_label')">
            <UInput
              v-model="ldapUsername"
              name="username"
              type="text"
              :placeholder="t('auth.login.ldap_username_placeholder')"
              autocomplete="username"
              size="lg"
              class="w-full"
              :ui="inputUi"
              :disabled="ldapSubmitting"
              autofocus
            />
          </UFormGroup>

          <UFormGroup :label="t('auth.login.password')">
            <UInput
              v-model="ldapPassword"
              name="password"
              type="password"
              :placeholder="t('auth.login.ldap_password_placeholder')"
              autocomplete="current-password"
              size="lg"
              class="w-full"
              :ui="inputUi"
              :disabled="ldapSubmitting"
            />
          </UFormGroup>

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
        </form>

        <div
          v-else-if="activeMode === 'oidc'"
          :id="panelId('oidc')"
          key="oidc"
          class="space-y-6 text-center"
          role="tabpanel"
          :aria-labelledby="availableModes.length > 1 ? tabId('oidc') : undefined"
        >
          <div class="space-y-1.5 text-center">
            <h2 class="text-xl font-semibold tracking-tight text-slate-950">
              {{ t('auth.login.sso_title') }}
            </h2>
            <p class="text-sm leading-6 text-slate-500">
              {{ t('auth.login.sso_help') }}
            </p>
          </div>

          <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <div class="mb-2 flex justify-center">
              <UIcon name="i-heroicons-building-office-2" class="h-5 w-5 text-slate-500" aria-hidden="true" />
            </div>
            {{ t('auth.login.sso_provider_generic') }}
          </div>

          <UButton
            type="button"
            block
            size="lg"
            icon="i-heroicons-arrow-right-on-rectangle"
            :loading="ssoRedirecting"
            class="h-12 justify-center bg-gradient-to-r from-blue-600 to-indigo-600 font-semibold shadow-lg shadow-blue-900/20 hover:from-blue-700 hover:to-indigo-700"
            @click="onSsoClick"
          >
            {{ t('auth.login.sso_submit') }}
          </UButton>
        </div>
      </Transition>
    </div>
  </section>
</template>

<script setup lang="ts">
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
    id:    p.key,
    label: t(tabLabelKeys[p.key]) as string,
    loginUrl: p.loginUrl,
  })),
)

const activeMode = ref<ModeId>('local')

watch(
  () => [props.providers, props.defaultProvider] as const,
  () => {
    const ids = availableModes.value.map((m) => m.id)
    if (ids.length === 0) return
    const preferred = props.defaultProvider && ids.includes(props.defaultProvider)
      ? props.defaultProvider
      : ids[0]!
    if (!ids.includes(activeMode.value)) {
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

const activeIcon = computed(() => {
  switch (activeMode.value) {
    case 'ldap':
      return 'i-heroicons-server-stack'
    case 'oidc':
      return 'i-heroicons-shield-check'
    default:
      return 'i-heroicons-key'
  }
})

const inputUi = {
  base: 'h-12 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/30',
}

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
    : 'text-slate-600 hover:text-slate-950'
}

function selectMode(id: ModeId) {
  if (availableModes.value.some((m) => m.id === id)) {
    if (activeMode.value !== id) {
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
