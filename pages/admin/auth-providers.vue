<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import { buildLdapTestConfigSummary } from '~/server/utils/ldap-diagnostics'
import {
  AUTH_PROVIDERS_TAB_STORAGE_KEY,
  defaultAuthProviderTab,
  ldapTestClientNetworkFailure,
  mapLdapTestApiResponse,
  parseMappingRulesJsonForUi,
  type AuthProviderTabId,
  type LdapTestApiResponse,
  type LdapTestClientState,
  type OidcTestClientState,
} from '~/utils/auth-providers-admin-ui'

definePageMeta({ layout: 'default' })

const authStore = useAuthStore()
const router    = useRouter()
const { success: toastOk, error: toastErr } = useAppToast()
const { t, tError } = useEsosI18n()

const canAccess = computed(() => {
  const role = authStore.user?.role
  return role === 'admin' || role === 'operator' || role === 'viewer'
})

const readOnly = computed(() => authStore.user?.role !== 'admin')

const { data, refresh, pending } = await useFetch<AdminAuthProvidersDto>('/api/admin/auth-providers', {
  key: 'admin-auth-providers',
  lazy: true,
})

const publicOrigin = ref('')
const activeTab = ref<AuthProviderTabId>('local')

onMounted(() => {
  if (import.meta.client) {
    publicOrigin.value = `${window.location.protocol}//${window.location.host}`
    const stored = sessionStorage.getItem(AUTH_PROVIDERS_TAB_STORAGE_KEY) as AuthProviderTabId | null
    if (stored === 'local' || stored === 'ldap' || stored === 'oidc' || stored === 'roles' || stored === 'security') {
      activeTab.value = stored
    }
  }
  if (canAccess.value) void refresh()
})

watch(activeTab, (tab) => {
  if (import.meta.client) sessionStorage.setItem(AUTH_PROVIDERS_TAB_STORAGE_KEY, tab)
})

watchEffect(() => {
  if (authStore.fetched && !canAccess.value) {
    router.replace('/admin')
  }
})

watch(data, (d) => {
  if (!d || import.meta.client === false) return
  const stored = sessionStorage.getItem(AUTH_PROVIDERS_TAB_STORAGE_KEY)
  if (!stored) activeTab.value = defaultAuthProviderTab(d)
}, { immediate: true })

const saving = ref(false)
const ldapBindPw = ref('')
const oidcSecret = ref('')
const ldapLookupUsername = ref('')

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
  oidcMaxRole: 'none' as 'none' | 'admin' | 'operator' | 'viewer',
  ldapMaxRole: 'none' as 'none' | 'admin' | 'operator' | 'viewer',
})

watch(
  data,
  (d) => {
    if (!d) return
    form.ldapEnabled              = d.ldap.enabled
    form.ldapUrl                  = d.ldap.url
    form.ldapStartTls             = d.ldap.startTls
    form.ldapTlsVerify            = d.ldap.tlsVerify
    form.ldapBindDn               = d.ldap.bindDn
    form.ldapBaseDn               = d.ldap.baseDn
    form.ldapUserSearchFilter     = d.ldap.userSearchFilter
    form.ldapUsernameAttribute    = d.ldap.usernameAttribute
    form.ldapDisplayNameAttribute = d.ldap.displayNameAttribute
    form.ldapGroupAttribute       = d.ldap.groupAttribute
    form.ldapTimeoutSec           = d.ldap.timeoutSec

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

const showOidcMfaRecommendation = computed(
  () => form.oidcEnabled && form.mfaMode !== 'idp_required',
)

function selectTab(tab: AuthProviderTabId) {
  activeTab.value = tab
}

async function save() {
  const parsed = parseMappingRulesJsonForUi(form.mappingRulesJson)
  if (!parsed.ok) {
    toastErr(
      t('admin.authProviders.toasts.mappingRulesTitle'),
      t(`admin.authProviders.jsonErrors.${parsed.code}`),
    )
    activeTab.value = 'roles'
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
const testingLdapLookup = ref(false)
const lastLdapTest = ref<LdapTestClientState>(null)

function ldapConfigFromForm() {
  return buildLdapTestConfigSummary({
    enabled:            form.ldapEnabled,
    url:                form.ldapUrl,
    startTls:           form.ldapStartTls,
    tlsVerify:          form.ldapTlsVerify,
    bindDn:             form.ldapBindDn,
    bindPasswordSet:    data.value?.ldap.bindPasswordSet ?? false,
    baseDn:             form.ldapBaseDn,
    userSearchFilter:   form.ldapUserSearchFilter,
    usernameAttribute:  form.ldapUsernameAttribute,
    displayNameAttribute: form.ldapDisplayNameAttribute,
    groupAttribute:     form.ldapGroupAttribute,
    timeoutSec:         form.ldapTimeoutSec,
  })
}

async function testLdapBind() {
  if (readOnly.value) return
  testingLdap.value = true
  lastLdapTest.value = null
  try {
    const r = await $fetch<LdapTestApiResponse>('/api/admin/auth-providers/ldap/test', {
      method: 'POST',
      body: ldapBindPw.value ? { bindPassword: ldapBindPw.value } : {},
    })
    const mapped = mapLdapTestApiResponse(r, { bindOnly: true })
    if (mapped) {
      lastLdapTest.value = mapped
      if (r.ok) {
        toastOk(
          t('admin.authProviders.toasts.ldapTitle'),
          t('admin.authProviders.toasts.ldapBindOk', { count: r.searchSampleCount ?? 0 }),
        )
      } else {
        toastErr(t('admin.authProviders.toasts.ldapTitle'), mapped.error)
      }
    }
  } catch (e: unknown) {
    const msg = tError(e)
    lastLdapTest.value = ldapTestClientNetworkFailure(msg, ldapConfigFromForm())
    toastErr(t('admin.authProviders.toasts.ldapTitle'), msg)
  } finally {
    testingLdap.value = false
  }
}

async function testLdapLookup() {
  if (readOnly.value || !ldapLookupUsername.value.trim()) return
  testingLdapLookup.value = true
  const lookupUser = ldapLookupUsername.value.trim()
  try {
    const r = await $fetch<LdapTestApiResponse>('/api/admin/auth-providers/ldap/test', {
      method: 'POST',
      body: {
        ...(ldapBindPw.value ? { bindPassword: ldapBindPw.value } : {}),
        username: lookupUser,
      },
    })
    const mapped = mapLdapTestApiResponse(r)
    if (mapped) {
      lastLdapTest.value = mapped
      if (!r.ok) toastErr(t('admin.authProviders.toasts.ldapTitle'), mapped.error)
    }
  } catch (e: unknown) {
    const msg = tError(e)
    lastLdapTest.value = ldapTestClientNetworkFailure(
      msg,
      buildLdapTestConfigSummary(
        {
          enabled:            form.ldapEnabled,
          url:                form.ldapUrl,
          startTls:           form.ldapStartTls,
          tlsVerify:          form.ldapTlsVerify,
          bindDn:             form.ldapBindDn,
          bindPasswordSet:    data.value?.ldap.bindPasswordSet ?? false,
          baseDn:             form.ldapBaseDn,
          userSearchFilter:   form.ldapUserSearchFilter,
          usernameAttribute:  form.ldapUsernameAttribute,
          displayNameAttribute: form.ldapDisplayNameAttribute,
          groupAttribute:     form.ldapGroupAttribute,
          timeoutSec:         form.ldapTimeoutSec,
        },
        { username: lookupUser },
      ),
    )
    toastErr(t('admin.authProviders.toasts.ldapTitle'), msg)
  } finally {
    testingLdapLookup.value = false
  }
}

const testingOidc = ref(false)
const lastOidcTest = ref<OidcTestClientState>(null)

async function testOidc() {
  if (readOnly.value) return
  testingOidc.value = true
  lastOidcTest.value = null
  try {
    const r = await $fetch<{
      ok: boolean
      authorizationEndpoint?: boolean
      tokenEndpoint?: boolean
      jwksUri?: boolean
      error?: string
    }>('/api/admin/auth-providers/oidc/test', { method: 'POST' })
    if (r.ok) {
      lastOidcTest.value = {
        ok: true,
        authorizationEndpoint: r.authorizationEndpoint,
        tokenEndpoint:         r.tokenEndpoint,
        jwksUri:               r.jwksUri,
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
  <div v-if="canAccess" class="min-h-screen flex flex-col">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full space-y-8">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-2 min-w-0">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {{ t('admin.authProviders.page.title') }}
          </h1>
          <p class="text-base text-gray-600 dark:text-gray-400 max-w-3xl">
            {{ t('admin.authProviders.page.subtitle') }}
          </p>
        </div>
        <UButton to="/admin" color="gray" variant="soft" icon="i-heroicons-arrow-left" class="shrink-0 self-start">
          {{ t('admin.authProviders.page.back') }}
        </UButton>
      </header>

      <div v-if="pending" class="text-gray-400 flex items-center gap-2">
        <span class="animate-spin">↻</span> {{ t('admin.authProviders.page.loading') }}
      </div>

      <template v-else-if="data">
        <AuthProvidersSummaryCards
          :active-tab="activeTab"
          :data="data"
          :form="form"
          :ldap-bind-password-set="data.ldap.bindPasswordSet"
          :oidc-client-secret-set="data.oidc.clientSecretSet"
          :last-ldap-test="lastLdapTest"
          :last-oidc-test="lastOidcTest"
          @select-tab="selectTab"
        />

        <AuthProvidersTabBar v-model="activeTab" :read-only="readOnly" />

        <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 lg:p-8">
          <AuthProvidersLocalTab v-show="activeTab === 'local'" :data="data" />
          <AuthProvidersLdapTab
            v-show="activeTab === 'ldap'"
            v-model:form="form"
            v-model:ldap-bind-pw="ldapBindPw"
            v-model:ldap-lookup-username="ldapLookupUsername"
            :data="data"
            :read-only="readOnly"
            :last-ldap-test="lastLdapTest"
            :testing-ldap="testingLdap"
            :testing-ldap-lookup="testingLdapLookup"
            @test-bind="testLdapBind"
            @test-lookup="testLdapLookup"
          />
          <AuthProvidersOidcTab
            v-show="activeTab === 'oidc'"
            v-model:form="form"
            v-model:oidc-secret="oidcSecret"
            :data="data"
            :read-only="readOnly"
            :public-origin="publicOrigin"
            :last-oidc-test="lastOidcTest"
            :testing-oidc="testingOidc"
            @test-discovery="testOidc"
            @go-roles-tab="selectTab('roles')"
          />
          <AuthProvidersRolesTab
            v-show="activeTab === 'roles'"
            v-model:form="form"
            :read-only="readOnly"
          />
          <AuthProvidersSecurityTab
            v-show="activeTab === 'security'"
            v-model:form="form"
            :read-only="readOnly"
            :show-oidc-mfa-recommendation="showOidcMfaRecommendation"
          />
        </div>
      </template>
    </div>

    <AuthProvidersPageFooter
      v-if="data && !pending"
      :saving="saving"
      :read-only="readOnly"
      @save="save"
    />
  </div>
</template>
