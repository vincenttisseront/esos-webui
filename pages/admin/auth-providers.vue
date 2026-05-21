<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import type { AuthProviderSummaryBadge } from '~/utils/auth-providers-admin-ui'
import {
  LDAP_USER_SEARCH_SIZE_LIMIT,
  MAPPING_RULES_JSON_EXAMPLE,
  authProviderSecurityAlerts,
  authProviderSummaryBadges,
  ldapCardTopWarningFromForm,
  ldapConnectionModeKind,
  oidcCallbackPreview,
  parseMappingRulesJsonForUi,
} from '~/utils/auth-providers-admin-ui'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const router    = useRouter()
const { success: toastOk, error: toastErr } = useAppToast()
const { t, tError } = useEsosI18n()

const { data, refresh, pending } = await useFetch<AdminAuthProvidersDto>('/api/admin/auth-providers', {
  key:  'admin-auth-providers',
  lazy: true,
})

const publicOrigin = ref('')

onMounted(() => {
  if (import.meta.client) {
    publicOrigin.value = `${window.location.protocol}//${window.location.host}`
  }
  if (authStore.user?.role === 'admin') void refresh()
})

const saving = ref(false)

const ldapBindPw = ref('')
const oidcSecret = ref('')

watchEffect(() => {
  if (authStore.fetched && authStore.user?.role !== 'admin') {
    router.replace('/admin')
  }
})

const form = reactive({
  ldapEnabled: false,
  ldapUrl: '',
  ldapStartTls: false,
  ldapTlsVerify: true,
  ldapBindDn: '',
  ldapBaseDn: '',
  ldapUserSearchFilter: '',
  ldapUsernameAttribute: '',
  ldapDisplayNameAttribute: '',
  ldapGroupAttribute: '',
  ldapTimeoutSec: 10,

  oidcEnabled: false,
  oidcIssuer: '',
  oidcClientId: '',
  oidcScopes: '',
  oidcRedirectPath: '',
  oidcClockSkewSec: 60,

  jitEnabled: false,
  jitDefaultRole: 'viewer' as 'admin' | 'operator' | 'viewer',
  jitDefaultActive: true,
  mfaMode: 'off' as 'off' | 'idp_required' | 'idp_preferred',
  mappingRulesJson: '[]',
  /** Radix Select forbids item value ""; use sentinel for « no cap » → API null */
  oidcMaxRole: 'none' as 'none' | 'admin' | 'operator' | 'viewer',
  ldapMaxRole: 'none' as 'none' | 'admin' | 'operator' | 'viewer',
})

watch(
  data,
  (d) => {
    if (!d) return
    form.ldapEnabled             = d.ldap.enabled
    form.ldapUrl                 = d.ldap.url
    form.ldapStartTls            = d.ldap.startTls
    form.ldapTlsVerify           = d.ldap.tlsVerify
    form.ldapBindDn              = d.ldap.bindDn
    form.ldapBaseDn              = d.ldap.baseDn
    form.ldapUserSearchFilter    = d.ldap.userSearchFilter
    form.ldapUsernameAttribute   = d.ldap.usernameAttribute
    form.ldapDisplayNameAttribute = d.ldap.displayNameAttribute
    form.ldapGroupAttribute      = d.ldap.groupAttribute
    form.ldapTimeoutSec          = d.ldap.timeoutSec

    form.oidcEnabled       = d.oidc.enabled
    form.oidcIssuer        = d.oidc.issuer
    form.oidcClientId      = d.oidc.clientId
    form.oidcScopes        = d.oidc.scopes
    form.oidcRedirectPath  = d.oidc.redirectPath
    form.oidcClockSkewSec  = d.oidc.clockSkewSec

    form.jitEnabled        = d.auth.jitEnabled
    form.jitDefaultRole    = d.auth.jitDefaultRole
    form.jitDefaultActive  = d.auth.jitDefaultActive
    form.mfaMode           = d.auth.mfaMode
    form.mappingRulesJson  = d.auth.mappingRulesJson
    form.oidcMaxRole       = (d.auth.oidcMaxRole ?? 'none') as typeof form.oidcMaxRole
    form.ldapMaxRole       = (d.auth.ldapMaxRole ?? 'none') as typeof form.ldapMaxRole
  },
  { immediate: true },
)

const oidcCallbackFullUrl = computed(() =>
  oidcCallbackPreview(publicOrigin.value, form.oidcRedirectPath),
)

const securityAlerts = computed(() =>
  authProviderSecurityAlerts({
    ldapUrl:          form.ldapUrl,
    ldapStartTls:     form.ldapStartTls,
    ldapTlsVerify:    form.ldapTlsVerify,
    ldapEnabled:      form.ldapEnabled,
    oidcIssuer:       form.oidcIssuer,
    oidcEnabled:      form.oidcEnabled,
    mfaMode:          form.mfaMode,
    jitDefaultRole:   form.jitDefaultRole,
    mappingRulesJson: form.mappingRulesJson,
  }),
)

const summaryBadges = computed(() => {
  const d = data.value
  if (!d) return []
  return authProviderSummaryBadges({
    mfaMode:               form.mfaMode,
    ldapEnabled:           form.ldapEnabled,
    ldapTlsVerify:         form.ldapTlsVerify,
    oidcClientSecretSet:   d.oidc.clientSecretSet,
    ldapBindPasswordSet:   d.ldap.bindPasswordSet,
    mappingRulesJson:      form.mappingRulesJson,
    oidcEnabled:           form.oidcEnabled,
  })
})

const showOidcMfaRecommendation = computed(
  () => form.oidcEnabled && form.mfaMode !== 'idp_required',
)

const ldapCardTopWarning = computed(() =>
  ldapCardTopWarningFromForm({
    ldapEnabled:   form.ldapEnabled,
    ldapUrl:       form.ldapUrl,
    ldapStartTls:  form.ldapStartTls,
    ldapTlsVerify: form.ldapTlsVerify,
  }),
)

const ldapModeSummary = computed(() =>
  t(`admin.authProviders.ldapMode.${ldapConnectionModeKind(form.ldapUrl, form.ldapStartTls)}`),
)

const mappingJsonStatus = computed(() => parseMappingRulesJsonForUi(form.mappingRulesJson))

const jitRoleItems = computed(() => [
  { value: 'viewer' as const, label: t('admin.authProviders.roles.viewer') },
  { value: 'operator' as const, label: t('admin.authProviders.roles.operator') },
  { value: 'admin' as const, label: t('admin.authProviders.roles.admin') },
])

const mfaModeItems = computed(() => [
  { value: 'off' as const, label: t('admin.authProviders.mfa.off') },
  { value: 'idp_preferred' as const, label: t('admin.authProviders.mfa.idp_preferred') },
  { value: 'idp_required' as const, label: t('admin.authProviders.mfa.idp_required') },
])

const maxRoleItems = computed(() => [
  { value: 'none' as const, label: t('admin.authProviders.maxRole.none') },
  { value: 'viewer' as const, label: t('admin.authProviders.roles.viewer') },
  { value: 'operator' as const, label: t('admin.authProviders.roles.operator') },
  { value: 'admin' as const, label: t('admin.authProviders.roles.admin') },
])

function summaryBadgeLabel(b: AuthProviderSummaryBadge): string {
  if (b.id === 'mapping_rules')
    return t('admin.authProviders.badges.mapping_rules', { count: b.ruleCount ?? 0 }) as string
  return t(`admin.authProviders.badges.${b.id}`) as string
}

async function save() {
  const parsed = parseMappingRulesJsonForUi(form.mappingRulesJson)
  if (!parsed.ok) {
    toastErr(
      t('admin.authProviders.toasts.mappingRulesTitle'),
      t(`admin.authProviders.jsonErrors.${parsed.code}`),
    )
    return
  }
  saving.value = true
  try {
    const patch: Record<string, unknown> = {
      ldap: {
        enabled: form.ldapEnabled,
        url: form.ldapUrl,
        startTls: form.ldapStartTls,
        tlsVerify: form.ldapTlsVerify,
        bindDn: form.ldapBindDn,
        baseDn: form.ldapBaseDn,
        userSearchFilter: form.ldapUserSearchFilter,
        usernameAttribute: form.ldapUsernameAttribute,
        displayNameAttribute: form.ldapDisplayNameAttribute,
        groupAttribute: form.ldapGroupAttribute,
        timeoutSec: form.ldapTimeoutSec,
      },
      oidc: {
        enabled: form.oidcEnabled,
        issuer: form.oidcIssuer,
        clientId: form.oidcClientId,
        scopes: form.oidcScopes,
        redirectPath: form.oidcRedirectPath,
        clockSkewSec: form.oidcClockSkewSec,
      },
      auth: {
        jitEnabled: form.jitEnabled,
        jitDefaultRole: form.jitDefaultRole,
        jitDefaultActive: form.jitDefaultActive,
        mfaMode: form.mfaMode,
        mappingRulesJson: form.mappingRulesJson,
        oidcMaxRole: form.oidcMaxRole === 'none' ? null : form.oidcMaxRole,
        ldapMaxRole: form.ldapMaxRole === 'none' ? null : form.ldapMaxRole,
      },
    }
    if (ldapBindPw.value) {
      (patch.ldap as Record<string, unknown>).bindPassword = ldapBindPw.value
    }
    if (oidcSecret.value) {
      (patch.oidc as Record<string, unknown>).clientSecret = oidcSecret.value
    }
    await $fetch('/api/admin/auth-providers', { method: 'PATCH', body: patch })
    ldapBindPw.value = ''
    oidcSecret.value = ''
    toastOk(t('admin.authProviders.toasts.saveTitle'), t('admin.authProviders.toasts.saveBody'))
    await refresh()
  } catch (e: unknown) {
    toastErr(t('admin.authProviders.toasts.errorTitle'), tError(e))
  } finally {
    saving.value = false
  }
}

const testingLdap = ref(false)
const lastLdapTest = ref<
  | { ok: true; searchSampleCount: number }
  | { ok: false; error: string }
  | null
>(null)

async function testLdap() {
  testingLdap.value = true
  lastLdapTest.value = null
  try {
    const r = await $fetch<{ ok: boolean; bindOk?: boolean; searchSampleCount?: number; error?: string }>(
      '/api/admin/auth-providers/ldap/test',
      {
        method: 'POST',
        body: ldapBindPw.value ? { bindPassword: ldapBindPw.value } : {},
      },
    )
    if (r.ok) {
      lastLdapTest.value = { ok: true, searchSampleCount: r.searchSampleCount ?? 0 }
      toastOk(
        t('admin.authProviders.toasts.ldapTitle'),
        t('admin.authProviders.toasts.ldapBindOk', { count: r.searchSampleCount ?? 0 }),
      )
    } else {
      lastLdapTest.value = { ok: false, error: r.error ?? t('admin.authProviders.toasts.failure') }
      toastErr(t('admin.authProviders.toasts.ldapTitle'), r.error ?? t('admin.authProviders.toasts.failure'))
    }
  } catch (e: unknown) {
    const msg = tError(e)
    lastLdapTest.value = { ok: false, error: msg }
    toastErr(t('admin.authProviders.toasts.ldapTitle'), msg)
  } finally {
    testingLdap.value = false
  }
}

const testingOidc = ref(false)
const lastOidcTest = ref<
  | {
      ok:                   true
      authorizationEndpoint: boolean
      tokenEndpoint:        boolean
      jwksUri:              boolean
    }
  | { ok: false; error: string }
  | null
>(null)

async function testOidc() {
  testingOidc.value = true
  lastOidcTest.value = null
  try {
    const r = await $fetch<{
      ok:                     boolean
      error?:                 string
      authorizationEndpoint?: boolean
      tokenEndpoint?:         boolean
      jwksUri?:               boolean
    }>('/api/admin/auth-providers/oidc/test', { method: 'POST' })
    if (r.ok) {
      lastOidcTest.value = {
        ok:                    true,
        authorizationEndpoint: !!r.authorizationEndpoint,
        tokenEndpoint:         !!r.tokenEndpoint,
        jwksUri:               !!r.jwksUri,
      }
      toastOk(t('admin.authProviders.toasts.oidcTitle'), t('admin.authProviders.toasts.oidcDiscoveryOk'))
    } else {
      lastOidcTest.value = { ok: false, error: r.error ?? t('admin.authProviders.toasts.failure') }
      toastErr(t('admin.authProviders.toasts.oidcTitle'), r.error ?? t('admin.authProviders.toasts.failure'))
    }
  } catch (e: unknown) {
    const msg = tError(e)
    lastOidcTest.value = { ok: false, error: msg }
    toastErr(t('admin.authProviders.toasts.oidcTitle'), msg)
  } finally {
    testingOidc.value = false
  }
}
</script>

<template>
  <div v-if="authStore.user?.role === 'admin'" class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-3 min-w-0">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.page.title') }}</h1>
        <p class="text-base text-gray-600 dark:text-gray-400 max-w-3xl">
          {{ t('admin.authProviders.page.subtitle') }}
        </p>
        <div v-if="data && summaryBadges.length" class="flex flex-wrap gap-2">
          <UBadge v-for="(b, i) in summaryBadges" :key="i" :color="b.color" variant="subtle">
            {{ summaryBadgeLabel(b) }}
          </UBadge>
        </div>
      </div>
      <UButton to="/admin" color="gray" variant="soft" icon="i-heroicons-arrow-left" class="shrink-0 self-start">
        {{ t('admin.authProviders.page.back') }}
      </UButton>
    </header>

    <div v-if="pending" class="text-gray-400 flex items-center gap-2">
      <span class="animate-spin">↻</span> {{ t('admin.authProviders.page.loading') }}
    </div>

    <template v-else-if="data">
      <section v-if="securityAlerts.length" class="space-y-3" aria-labelledby="auth-security-heading">
        <h2 id="auth-security-heading" class="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {{ t('admin.authProviders.page.securityHeading') }}
        </h2>
        <div class="space-y-2">
          <UAlert
            v-for="(a, i) in securityAlerts"
            :key="i"
            :color="a.color"
            :icon="a.icon"
            :title="t(`admin.authProviders.alerts.${a.id}.title`)"
            :description="t(`admin.authProviders.alerts.${a.id}.description`)"
          />
        </div>
      </section>

      <!-- 1. OpenID Connect (+ MFA, protections, test discovery) -->
      <UCard>
        <template #header>
          <div class="space-y-1">
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.cardTitle') }}</span>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.oidc.cardSubtitle') }}
            </p>
          </div>
        </template>
        <div class="p-6 lg:p-8 space-y-8">
          <UCheckbox
            v-model="form.oidcEnabled"
            :label="t('admin.authProviders.oidc.enableLabel')"
            :help="t('admin.authProviders.oidc.enableHelp')"
          />

          <div class="space-y-6">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.oidc.sectionConnection') }}
            </h3>
            <UFormGroup
              :label="t('admin.authProviders.oidc.issuerLabel')"
              :description="t('admin.authProviders.oidc.issuerDesc')"
            >
              <UInput
                v-model="form.oidcIssuer"
                :placeholder="t('admin.authProviders.oidc.issuerPlaceholder')"
                class="w-full font-mono text-base"
              />
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.oidc.clientIdLabel')"
              :description="t('admin.authProviders.oidc.clientIdDesc')"
            >
              <UInput
                v-model="form.oidcClientId"
                :placeholder="t('admin.authProviders.oidc.clientIdPlaceholder')"
                class="w-full text-base"
              />
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.oidc.clientSecretLabel')"
              :description="t('admin.authProviders.oidc.clientSecretDesc')"
            >
              <div class="space-y-3">
                <UInput
                  v-model="oidcSecret"
                  type="password"
                  autocomplete="off"
                  class="w-full font-mono text-base"
                  :placeholder="t('admin.authProviders.oidc.clientSecretPlaceholder')"
                />
                <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/80 p-4 space-y-2">
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {{ t('admin.authProviders.oidc.secretStateTitle') }}
                  </p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">
                    {{ t('admin.authProviders.oidc.secretStateDesc') }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <UBadge v-if="data.oidc.clientSecretSet" color="green" variant="solid">
                      {{ t('admin.authProviders.oidc.secretConfigured') }}
                    </UBadge>
                    <UBadge v-else color="gray" variant="subtle">
                      {{ t('admin.authProviders.oidc.secretMissing') }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.oidc.scopesLabel')"
              :description="t('admin.authProviders.oidc.scopesDesc')"
            >
              <UInput
                v-model="form.oidcScopes"
                :placeholder="t('admin.authProviders.oidc.scopesPlaceholder')"
                class="w-full font-mono text-base"
              />
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.oidc.redirectPathLabel')"
              :description="t('admin.authProviders.oidc.redirectPathDesc')"
            >
              <UInput
                v-model="form.oidcRedirectPath"
                :placeholder="t('admin.authProviders.oidc.redirectPathPlaceholder')"
                class="w-full font-mono text-base"
              />
            </UFormGroup>
            <UFormGroup
              v-if="oidcCallbackFullUrl"
              :label="t('admin.authProviders.oidc.callbackPreviewLabel')"
              :description="t('admin.authProviders.oidc.callbackPreviewDesc')"
            >
              <UInput :model-value="oidcCallbackFullUrl" readonly class="w-full font-mono text-base bg-gray-50 dark:bg-gray-950" />
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.oidc.clockSkewLabel')"
              :description="t('admin.authProviders.oidc.clockSkewDesc')"
            >
              <UInput
                v-model.number="form.oidcClockSkewSec"
                type="number"
                min="0"
                max="600"
                placeholder="60"
                class="w-full text-base"
              />
            </UFormGroup>
          </div>

          <div class="space-y-6 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.oidc.sectionSecurity') }}
            </h3>
          <UFormGroup
            :label="t('admin.authProviders.oidc.mfaPolicyLabel')"
            :description="t('admin.authProviders.oidc.mfaPolicyDesc')"
          >
            <USelect v-model="form.mfaMode" :items="mfaModeItems" value-key="value" class="w-full" />
          </UFormGroup>
          <UAlert
            color="blue"
            icon="i-heroicons-information-circle"
            :title="t('admin.authProviders.oidc.httpsProdTitle')"
            :description="t('admin.authProviders.oidc.httpsProdDesc')"
          />
          <UAlert
            v-if="showOidcMfaRecommendation"
            color="amber"
            icon="i-heroicons-light-bulb"
            :title="t('admin.authProviders.oidc.mfaRecommendTitle')"
            :description="t('admin.authProviders.oidc.mfaRecommendDesc')"
          />
          </div>

          <div class="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.protectionsTitle') }}</p>
            <ul class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <li class="flex gap-3 py-3 px-4">
                <UIcon name="i-heroicons-shield-check" class="size-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p class="font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.pkceTitle') }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {{ t('admin.authProviders.oidc.pkceBody') }}
                  </p>
                </div>
              </li>
              <li class="flex gap-3 py-3 px-4">
                <UIcon name="i-heroicons-user" class="size-5 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p class="font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.correlationTitle') }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {{ t('admin.authProviders.oidc.correlationBody') }}
                  </p>
                </div>
              </li>
              <li class="flex gap-3 py-3 px-4">
                <UIcon name="i-heroicons-map" class="size-5 text-gray-500 dark:text-gray-400 shrink-0 mt-0.5" />
                <div>
                  <p class="font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.mappingRolesTitle') }}</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {{ t('admin.authProviders.oidc.mappingRolesBody') }}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div class="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.oidc.testSection') }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('admin.authProviders.oidc.testDesc') }}
            </p>
            <UButton
              :label="t('admin.authProviders.oidc.testButton')"
              icon="i-heroicons-arrow-path"
              size="lg"
              :loading="testingOidc"
              color="primary"
              variant="outline"
              class="w-full sm:w-auto justify-center"
              @click="testOidc"
            />
          </div>
        </div>
      </UCard>

      <!-- 2. LDAP -->
      <UCard>
        <template #header>
          <div class="space-y-1">
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.ldap.cardTitle') }}</span>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.cardSubtitle') }}
            </p>
          </div>
        </template>
        <div class="p-6 lg:p-8 space-y-8">
          <UAlert
            v-if="ldapCardTopWarning"
            :color="ldapCardTopWarning.color"
            :icon="ldapCardTopWarning.icon"
            :title="t(`admin.authProviders.alerts.${ldapCardTopWarning.id}.title`)"
            :description="t(`admin.authProviders.alerts.${ldapCardTopWarning.id}.description`)"
          />
          <UCheckbox
            v-model="form.ldapEnabled"
            :label="t('admin.authProviders.ldap.enableLabel')"
            :help="t('admin.authProviders.ldap.enableHelp')"
          />

          <div class="space-y-6">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.sectionTransport') }}
            </h3>
          <UFormGroup
            :label="t('admin.authProviders.ldap.modeSummaryLabel')"
            :description="t('admin.authProviders.ldap.modeSummaryDesc')"
          >
            <UInput :model-value="ldapModeSummary" readonly class="w-full text-base bg-gray-50 dark:bg-gray-950" />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.urlLabel')"
            :description="t('admin.authProviders.ldap.urlDesc')"
          >
            <UInput
              v-model="form.ldapUrl"
              :placeholder="t('admin.authProviders.ldap.urlPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.startTlsLabel')"
            :description="t('admin.authProviders.ldap.startTlsDesc')"
          >
            <UCheckbox v-model="form.ldapStartTls" :label="t('admin.authProviders.ldap.startTlsCheckbox')" />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.tlsVerifyLabel')"
            :description="t('admin.authProviders.ldap.tlsVerifyDesc')"
          >
            <UCheckbox v-model="form.ldapTlsVerify" :label="t('admin.authProviders.ldap.tlsVerifyCheckbox')" />
          </UFormGroup>
          </div>

          <div class="space-y-6 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.sectionBind') }}
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              <UFormGroup
                :label="t('admin.authProviders.ldap.bindDnLabel')"
                :description="t('admin.authProviders.ldap.bindDnDesc')"
              >
                <UInput
                  v-model="form.ldapBindDn"
                  :placeholder="t('admin.authProviders.ldap.bindDnPlaceholder')"
                  class="w-full font-mono text-base"
                />
              </UFormGroup>
              <UFormGroup
                :label="t('admin.authProviders.ldap.bindPasswordLabel')"
                :description="t('admin.authProviders.ldap.bindPasswordDesc')"
              >
                <div class="space-y-3">
                  <UInput
                    v-model="ldapBindPw"
                    type="password"
                    autocomplete="off"
                    class="w-full font-mono text-base"
                    :placeholder="t('admin.authProviders.ldap.bindPasswordPlaceholder')"
                  />
                  <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/80 p-4 space-y-2">
                    <p class="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {{ t('admin.authProviders.ldap.bindPwStateTitle') }}
                    </p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      {{ t('admin.authProviders.ldap.bindPwStateDesc') }}
                    </p>
                    <div class="flex flex-wrap gap-2">
                      <UBadge v-if="data.ldap.bindPasswordSet" color="green" variant="solid">
                        {{ t('admin.authProviders.ldap.bindPwConfigured') }}
                      </UBadge>
                      <UBadge v-else color="gray" variant="subtle">
                        {{ t('admin.authProviders.ldap.bindPwMissing') }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </UFormGroup>
            </div>
          </div>

          <div class="space-y-6 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.sectionSearch') }}
            </h3>
          <UFormGroup
            :label="t('admin.authProviders.ldap.baseDnLabel')"
            :description="t('admin.authProviders.ldap.baseDnDesc')"
          >
            <UInput
              v-model="form.ldapBaseDn"
              :placeholder="t('admin.authProviders.ldap.baseDnPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.userFilterLabel')"
            :description="t('admin.authProviders.ldap.userFilterDesc', { usernameMark: '{{username}}' })"
          >
            <UInput
              v-model="form.ldapUserSearchFilter"
              :placeholder="t('admin.authProviders.ldap.userFilterPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.usernameAttrLabel')"
            :description="t('admin.authProviders.ldap.usernameAttrDesc', { usernameMark: '{{username}}' })"
          >
            <UInput
              v-model="form.ldapUsernameAttribute"
              :placeholder="t('admin.authProviders.ldap.usernameAttrPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.displayNameAttrLabel')"
            :description="t('admin.authProviders.ldap.displayNameAttrDesc')"
          >
            <UInput
              v-model="form.ldapDisplayNameAttribute"
              :placeholder="t('admin.authProviders.ldap.displayNameAttrPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.groupAttrLabel')"
            :description="t('admin.authProviders.ldap.groupAttrDesc')"
          >
            <UInput
              v-model="form.ldapGroupAttribute"
              :placeholder="t('admin.authProviders.ldap.groupAttrPlaceholder')"
              class="w-full font-mono text-base"
            />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.ldap.timeoutLabel')"
            :description="t('admin.authProviders.ldap.timeoutDesc')"
          >
            <UInput v-model.number="form.ldapTimeoutSec" type="number" min="1" max="120" placeholder="10" class="w-full text-base" />
          </UFormGroup>
          <UAlert
            color="gray"
            icon="i-heroicons-queue-list"
            :title="t('admin.authProviders.ldap.searchLimitTitle')"
            :description="t('admin.authProviders.ldap.searchLimitDesc', { limit: LDAP_USER_SEARCH_SIZE_LIMIT })"
          />
          <UAlert
            color="gray"
            icon="i-heroicons-document-minus"
            :title="t('admin.authProviders.ldap.customCaTitle')"
            :description="t('admin.authProviders.ldap.customCaDesc')"
          />
          </div>

          <div class="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.testSection') }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('admin.authProviders.ldap.testDesc') }}
            </p>
            <UButton
              :label="t('admin.authProviders.ldap.testButton')"
              icon="i-heroicons-arrow-path"
              size="lg"
              :loading="testingLdap"
              color="primary"
              variant="outline"
              class="w-full sm:w-auto justify-center"
              @click="testLdap"
            />
          </div>
        </div>
      </UCard>

      <!-- 3. Cartographie & JIT -->
      <UCard>
        <template #header>
          <div class="space-y-1">
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.mapping.cardTitle') }}</span>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.mapping.cardSubtitle') }}
            </p>
          </div>
        </template>
        <div class="p-6 lg:p-8 space-y-8">
          <UCheckbox
            v-model="form.jitEnabled"
            :label="t('admin.authProviders.mapping.jitEnableLabel')"
            :help="t('admin.authProviders.mapping.jitEnableHelp')"
          />
          <UFormGroup
            :label="t('admin.authProviders.mapping.jitDefaultRoleLabel')"
            :description="t('admin.authProviders.mapping.jitDefaultRoleDesc')"
          >
            <USelect v-model="form.jitDefaultRole" :items="jitRoleItems" value-key="value" class="w-full" />
          </UFormGroup>
          <UFormGroup
            :label="t('admin.authProviders.mapping.jitActiveLabel')"
            :description="t('admin.authProviders.mapping.jitActiveDesc')"
          >
            <UCheckbox v-model="form.jitDefaultActive" :label="t('admin.authProviders.mapping.jitActiveCheckbox')" />
          </UFormGroup>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <UFormGroup
              :label="t('admin.authProviders.mapping.oidcMaxRoleLabel')"
              :description="t('admin.authProviders.mapping.oidcMaxRoleDesc')"
            >
              <USelect v-model="form.oidcMaxRole" :items="maxRoleItems" value-key="value" class="w-full" />
            </UFormGroup>
            <UFormGroup
              :label="t('admin.authProviders.mapping.ldapMaxRoleLabel')"
              :description="t('admin.authProviders.mapping.ldapMaxRoleDesc')"
            >
              <USelect v-model="form.ldapMaxRole" :items="maxRoleItems" value-key="value" class="w-full" />
            </UFormGroup>
          </div>
          <UFormGroup
            :label="t('admin.authProviders.mapping.rulesJsonLabel')"
            :error="mappingJsonStatus.ok ? undefined : t(`admin.authProviders.jsonErrors.${mappingJsonStatus.code}`)"
            :description="t('admin.authProviders.mapping.rulesJsonDesc')"
          >
            <UTextarea v-model="form.mappingRulesJson" :rows="12" class="w-full font-mono text-base min-h-[12rem]" />
          </UFormGroup>
          <UFormGroup :label="t('admin.authProviders.mapping.exampleLabel')">
            <UTextarea
              :model-value="MAPPING_RULES_JSON_EXAMPLE"
              readonly
              :rows="6"
              class="w-full font-mono text-xs bg-gray-50 dark:bg-gray-950"
            />
          </UFormGroup>
        </div>
      </UCard>

      <!-- 4. Enregistrement et diagnostics -->
      <UCard class="lg:sticky lg:top-4 lg:z-10">
        <template #header>
          <div class="space-y-1">
            <span class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.save.cardTitle') }}</span>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.save.cardSubtitle') }}
            </p>
          </div>
        </template>
        <div class="p-6 lg:p-8 space-y-8">
          <div class="space-y-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.save.actionsSection') }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('admin.authProviders.save.actionsIntro') }}
            </p>
            <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch">
              <UButton
                :label="t('admin.authProviders.save.saveButton')"
                icon="i-heroicons-check"
                size="lg"
                :loading="saving"
                color="primary"
                class="w-full sm:flex-1 sm:min-w-[12rem] justify-center"
                @click="save"
              />
              <UButton
                to="/admin"
                color="gray"
                variant="soft"
                :label="t('common.actions.cancel')"
                size="lg"
                class="w-full sm:w-auto justify-center"
              />
            </div>
          </div>

          <div class="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ t('admin.authProviders.save.quickTestsSection') }}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ t('admin.authProviders.save.quickTestsIntro') }}
            </p>
            <div class="flex flex-col sm:flex-row flex-wrap gap-3">
              <UButton
                :label="t('admin.authProviders.save.testOidcButton')"
                icon="i-heroicons-arrow-path"
                size="lg"
                :loading="testingOidc"
                color="primary"
                variant="outline"
                class="w-full sm:w-auto justify-center"
                @click="testOidc"
              />
              <UButton
                :label="t('admin.authProviders.save.testLdapButton')"
                icon="i-heroicons-arrow-path"
                size="lg"
                :loading="testingLdap"
                color="primary"
                variant="outline"
                class="w-full sm:w-auto justify-center"
                @click="testLdap"
              />
            </div>
          </div>

          <div class="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.save.resultsTitle') }}</p>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-gray-50 dark:bg-gray-950/50">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {{ t('admin.authProviders.save.oidcResultHeading') }}
              </p>
              <div v-if="lastOidcTest" class="space-y-2">
                <template v-if="lastOidcTest.ok">
                  <p class="text-sm text-green-700 font-medium">{{ t('admin.authProviders.save.success') }}</p>
                  <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1 font-mono">
                    <li>
                      authorization_endpoint :
                      {{ lastOidcTest.authorizationEndpoint ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}
                    </li>
                    <li>
                      token_endpoint :
                      {{ lastOidcTest.tokenEndpoint ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}
                    </li>
                    <li>
                      jwks_uri :
                      {{ lastOidcTest.jwksUri ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}
                    </li>
                  </ul>
                </template>
                <UAlert
                  v-else
                  color="red"
                  icon="i-heroicons-x-circle"
                  :title="t('admin.authProviders.save.oidcFailTitle')"
                  :description="lastOidcTest.error"
                />
              </div>
              <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.save.noOidcTest') }}</p>
            </div>
            <div class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 bg-gray-50 dark:bg-gray-950/50">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {{ t('admin.authProviders.save.ldapResultHeading') }}
              </p>
              <div v-if="lastLdapTest">
                <p v-if="lastLdapTest.ok" class="text-sm text-green-700 font-mono">
                  {{ t('admin.authProviders.save.ldapSuccessSample', { count: lastLdapTest.searchSampleCount }) }}
                </p>
                <UAlert
                  v-else
                  color="red"
                  icon="i-heroicons-x-circle"
                  :title="t('admin.authProviders.save.ldapFailTitle')"
                  :description="lastLdapTest.error"
                />
              </div>
              <p v-else class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.save.noLdapTest') }}</p>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
