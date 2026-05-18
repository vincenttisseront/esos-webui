<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useSSHStore } from '~/stores/ssh'
import { useOverviewStore } from '~/stores/overview'
import { useStatsStore } from '~/stores/stats'
import { useSelectedSan } from '~/composables/useSelectedSan'

definePageMeta({ layout: false })

const auth   = useAuthStore()
const router = useRouter()
const route  = useRoute()
const { t, tError } = useEsosI18n()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const ldapUsername = ref('')
const ldapPassword = ref('')
const ldapSubmitting = ref(false)

const { data: providers } = await useFetch<{ local: boolean; ldap: boolean; oidc: boolean }>(
  '/api/auth/providers',
)

const features = computed(() => [
  { icon: 'i-heroicons-eye',          label: t('auth.login.features.monitoring') },
  { icon: 'i-heroicons-circle-stack', label: t('auth.login.features.devices')    },
  { icon: 'i-heroicons-chart-bar',    label: t('auth.login.features.stats')      },
  { icon: 'i-heroicons-share',        label: t('auth.login.features.topology')   },
])

// Mapping code query-string -> clé i18n sous `errors.oidc.*`.
const OIDC_ERROR_KEYS: Record<string, string> = {
  oidc_denied:    'errors.oidc.denied',
  oidc_missing:   'errors.oidc.missing',
  oidc_disabled:  'errors.oidc.disabled',
  oidc_state:     'errors.oidc.state',
  oidc_corrupt:   'errors.oidc.corrupt',
  oidc_discovery: 'errors.oidc.discovery',
  oidc_token:     'errors.oidc.token',
  oidc_claims:    'errors.oidc.claims',
  mfa_required:   'errors.oidc.mfa_required',
  oidc_user:      'errors.oidc.user',
  inactive:       'errors.oidc.inactive',
}

function applyRouteError() {
  const q = route.query.error
  if (typeof q === 'string' && q) {
    const key = OIDC_ERROR_KEYS[q]
    error.value = key ? (t(key) as string) : (t('errors.oidc.external_generic') as string)
  }
}

onMounted(() => {
  applyRouteError()
})

watch(
  () => route.query.error,
  () => applyRouteError(),
)

async function bootstrapAfterLogin(user: { forcePasswordChange: boolean }) {
  const sanSelector   = useSelectedSan()
  const sshStore      = useSSHStore()
  const overviewStore = useOverviewStore()
  const statsStore    = useStatsStore()
  await sanSelector.fetchSans()
  sshStore.startPolling()
  overviewStore.startPolling()
  statsStore.startPolling()

  if (user.forcePasswordChange) {
    await router.push('/admin/change-password')
  } else {
    await router.push('/')
  }
}

async function onSubmit() {
  error.value = null
  submitting.value = true
  try {
    const user = await auth.login(username.value, password.value)
    await bootstrapAfterLogin(user)
  } catch (err: unknown) {
    error.value = tError(err as never, t('auth.login.generic_error') as string)
  } finally {
    submitting.value = false
  }
}

async function onLdapSubmit() {
  error.value = null
  ldapSubmitting.value = true
  try {
    const user = await auth.loginLdap(ldapUsername.value, ldapPassword.value)
    await bootstrapAfterLogin(user)
  } catch (err: unknown) {
    error.value = tError(err as never, t('auth.login.generic_error') as string)
  } finally {
    ldapSubmitting.value = false
  }
}

function startOidc() {
  window.location.href = '/api/auth/oidc/login'
}

function onForgotPasswordToast() {
  useToast().add({
    title: t('auth.login.forgot_password_toast_title') as string,
    description: t('auth.login.forgot_password_toast_desc') as string,
    color: 'primary',
  })
}
</script>

<template>
  <div class="min-h-screen flex bg-[#F5F8FC]">
    <!-- Panneau gauche — branding -->
    <div class="hidden lg:flex lg:w-[46%] bg-[#08111F] flex-col items-center justify-center p-12 relative overflow-hidden">
      <!-- Grille décorative -->
      <div
        class="absolute inset-0 opacity-[0.07]"
        style="background-image: linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px); background-size: 36px 36px;"
      />
      <!-- Cercles décoratifs -->
      <div class="absolute -top-32 -left-32 w-96 h-96 bg-blue-500 rounded-full opacity-[0.15] blur-3xl" />
      <div class="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-700 rounded-full opacity-[0.15] blur-3xl" />
      <div class="absolute top-1/2 left-10 h-px w-2/3 bg-gradient-to-r from-transparent via-blue-300/20 to-transparent" />

      <div class="relative z-10 w-full max-w-md space-y-8">
        <!-- Logo -->
        <div class="flex items-center gap-4">
          <img src="/logo/logo-esos-icon.svg" alt="ESOS" class="w-14 h-14" />
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300/80">ESOS WebUI</p>
            <h1 class="mt-1 text-3xl font-bold tracking-tight text-white">Enterprise Storage OS</h1>
          </div>
        </div>

        <div>
          <p class="text-base leading-7 text-slate-300">
            {{ t('auth.login.enterprise_baseline') }}
          </p>
        </div>

        <div class="grid gap-3">
          <div
            v-for="item in features"
            :key="item.label"
            class="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3"
          >
            <div class="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-300/15 flex items-center justify-center shrink-0">
              <UIcon :name="item.icon" class="w-4 h-4 text-blue-300" />
            </div>
            <span class="text-sm leading-5 text-slate-300">{{ item.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Panneau droit — formulaire premium -->
    <div
      class="flex-1 flex flex-col items-center justify-center bg-[#F5F8FC] p-6 lg:p-16"
    >
      <!-- Logo mobile -->
      <div class="lg:hidden mb-6 text-center">
        <img src="/logo/logo-esos-icon.svg" alt="ESOS" class="w-12 h-12 mx-auto mb-3" />
        <h1 class="text-xl font-bold text-gray-900">{{ t('app.name') }}</h1>
      </div>

      <div class="w-full max-w-md space-y-5">
        <div class="px-1 text-center lg:text-left">
          <h2 class="text-2xl font-bold tracking-tight text-gray-900">
            {{ t('auth.login.title') }}
          </h2>
          <p class="mt-1 text-sm text-gray-600">
            {{ t('auth.login.subtitle') }}
          </p>
        </div>

        <LoginCard
          v-model:username="username"
          v-model:password="password"
          v-model:ldap-username="ldapUsername"
          v-model:ldap-password="ldapPassword"
          :show-sso="!!providers?.oidc"
          :show-ldap="!!providers?.ldap"
          :submitting="submitting"
          :ldap-submitting="ldapSubmitting"
          :error="error"
          @submit-local="onSubmit"
          @ldap-submit="onLdapSubmit"
          @sso="startOidc"
          @forgot-password="onForgotPasswordToast"
        />

        <div class="flex items-center justify-between gap-3 px-1 pt-1">
          <p class="text-xs text-gray-500">
            {{ t('auth.login.footer_tagline') }}
          </p>
          <LanguageSwitcher mode="compact" />
        </div>
      </div>
    </div>
  </div>
</template>
