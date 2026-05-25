<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import type { AuthProviderTabId, LdapTestClientState, OidcTestClientState } from '~/utils/auth-providers-admin-ui'
import {
  ldapConfigCompleteFromForm,
  ldapConnectionModeKind,
  loginSummaryFromForm,
  oidcConfigCompleteFromForm,
  parseMappingRulesJsonForUi,
  truncateForSummary,
} from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  activeTab: AuthProviderTabId
  data: AdminAuthProvidersDto
  form: {
    ldapEnabled: boolean
    ldapUrl: string
    ldapBindDn: string
    ldapBaseDn: string
    ldapUserSearchFilter: string
    ldapStartTls: boolean
    oidcEnabled: boolean
    oidcIssuer: string
    oidcClientId: string
    jitEnabled: boolean
    jitDefaultRole: string
    mappingRulesJson: string
  }
  ldapBindPasswordSet: boolean
  oidcClientSecretSet: boolean
  lastLdapTest: LdapTestClientState
  lastOidcTest: OidcTestClientState
}>()

const emit = defineEmits<{
  'select-tab': [AuthProviderTabId]
}>()

const { t } = useEsosI18n()

const ldapComplete = computed(() =>
  ldapConfigCompleteFromForm({
    ldapUrl:              props.form.ldapUrl,
    ldapBindDn:           props.form.ldapBindDn,
    ldapBaseDn:           props.form.ldapBaseDn,
    ldapUserSearchFilter: props.form.ldapUserSearchFilter,
    ldapBindPasswordSet:  props.ldapBindPasswordSet,
  }),
)

const oidcComplete = computed(() =>
  oidcConfigCompleteFromForm({
    oidcIssuer:          props.form.oidcIssuer,
    oidcClientId:        props.form.oidcClientId,
    oidcClientSecretSet: props.oidcClientSecretSet,
  }),
)

const loginEval = computed(() =>
  loginSummaryFromForm({
    ldapEnabled:          props.form.ldapEnabled,
    ldapUrl:              props.form.ldapUrl,
    ldapBindDn:           props.form.ldapBindDn,
    ldapBaseDn:           props.form.ldapBaseDn,
    ldapUserSearchFilter: props.form.ldapUserSearchFilter,
    ldapBindPasswordSet:  props.ldapBindPasswordSet,
    oidcEnabled:          props.form.oidcEnabled,
    oidcIssuer:           props.form.oidcIssuer,
    oidcClientId:         props.form.oidcClientId,
    oidcClientSecretSet:  props.oidcClientSecretSet,
    jitEnabled:           props.form.jitEnabled,
    ldapUserCount:        props.data.summary.counts.ldap,
    oidcUserCount:        props.data.summary.counts.oidc,
  }),
)

const mappingStatus = computed(() => parseMappingRulesJsonForUi(props.form.mappingRulesJson))

function loginReasonLabel(reason: string | undefined): string {
  if (!reason) return ''
  return t(`admin.authProviders.summary.loginReason.${reason}`)
}

function cardClass(tab: AuthProviderTabId): string {
  const base = 'text-left rounded-xl border p-4 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'
  if (props.activeTab === tab) return `${base} border-primary-500 ring-1 ring-primary-500/30 bg-primary-50/50 dark:bg-primary-950/20`
  return `${base} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900`
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
    <button type="button" :class="cardClass('local')" @click="emit('select-tab', 'local')">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.summary.cards.local') }}
      </p>
      <p class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.summary.enabled') }}
      </p>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {{ t('admin.authProviders.summary.userCount', { count: data.summary.counts.local }) }}
      </p>
    </button>

    <button type="button" :class="cardClass('ldap')" @click="emit('select-tab', 'ldap')">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.summary.cards.ldap') }}
      </p>
      <p class="mt-2 text-sm font-medium" :class="form.ldapEnabled ? 'text-green-700 dark:text-green-400' : 'text-gray-500'">
        {{ form.ldapEnabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}
      </p>
      <ul class="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <li>
          {{ ldapComplete ? t('admin.authProviders.summary.configComplete') : t('admin.authProviders.summary.configIncomplete') }}
        </li>
        <li>{{ t(`admin.authProviders.ldapMode.${ldapConnectionModeKind(form.ldapUrl, form.ldapStartTls)}`) }}</li>
        <li>
          {{
            lastLdapTest === null
              ? t('admin.authProviders.summary.testNotRun')
              : lastLdapTest.ok
                ? t('admin.authProviders.summary.testOk')
                : t('admin.authProviders.summary.testFailed')
          }}
        </li>
        <li>{{ t('admin.authProviders.summary.userCount', { count: data.summary.counts.ldap }) }}</li>
        <li>
          {{
            loginEval.ldap.available
              ? t('admin.authProviders.summary.loginAvailable')
              : t('admin.authProviders.summary.loginHidden', { reason: loginReasonLabel(loginEval.ldap.reason) })
          }}
        </li>
      </ul>
    </button>

    <button type="button" :class="cardClass('oidc')" @click="emit('select-tab', 'oidc')">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.summary.cards.oidc') }}
      </p>
      <p class="mt-2 text-sm font-medium" :class="form.oidcEnabled ? 'text-green-700 dark:text-green-400' : 'text-gray-500'">
        {{ form.oidcEnabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}
      </p>
      <ul class="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <li>{{ truncateForSummary(form.oidcIssuer) }}</li>
        <li>
          {{ oidcComplete ? t('admin.authProviders.summary.configComplete') : t('admin.authProviders.summary.configIncomplete') }}
        </li>
        <li>
          {{
            lastOidcTest === null
              ? t('admin.authProviders.summary.testNotRun')
              : lastOidcTest.ok
                ? t('admin.authProviders.summary.discoveryOk')
                : t('admin.authProviders.summary.testFailed')
          }}
        </li>
        <li>{{ t('admin.authProviders.summary.userCount', { count: data.summary.counts.oidc }) }}</li>
        <li>
          {{
            loginEval.oidc.available
              ? t('admin.authProviders.summary.loginAvailable')
              : t('admin.authProviders.summary.loginHidden', { reason: loginReasonLabel(loginEval.oidc.reason) })
          }}
        </li>
      </ul>
    </button>

    <button type="button" :class="cardClass('roles')" @click="emit('select-tab', 'roles')">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.summary.cards.roles') }}
      </p>
      <p class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ form.jitEnabled ? t('admin.authProviders.summary.jitOn') : t('admin.authProviders.summary.jitOff') }}
      </p>
      <ul class="mt-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-400">
        <li>
          {{
            !mappingStatus.ok
              ? t('admin.authProviders.summary.rulesInvalid')
              : t('admin.authProviders.summary.rulesCount', { count: mappingStatus.ok ? mappingStatus.length : 0 })
          }}
        </li>
        <li>{{ t(`admin.authProviders.roles.${form.jitDefaultRole}`) }} ({{ t('admin.authProviders.summary.jitDefault') }})</li>
      </ul>
    </button>
  </div>
</template>
