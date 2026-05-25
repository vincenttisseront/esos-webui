<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import {
  LDAP_USER_SEARCH_SIZE_LIMIT,
  ldapCardTopWarningFromForm,
  ldapConfigCompleteFromForm,
  ldapConnectionModeKind,
  loginSummaryFromForm,
  truncateForSummary,
  type LdapTestClientState,
} from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  data: AdminAuthProvidersDto
  readOnly: boolean
  dirty: boolean
  saving: boolean
  lastLdapTest: LdapTestClientState
  testingLdap: boolean
  testingLdapLookup: boolean
}>()

const form = defineModel<{
  ldapEnabled: boolean
  ldapUrl: string
  ldapStartTls: boolean
  ldapTlsVerify: boolean
  ldapBindDn: string
  ldapBaseDn: string
  ldapUserSearchFilter: string
  ldapUsernameAttribute: string
  ldapDisplayNameAttribute: string
  ldapGroupAttribute: string
  ldapTimeoutSec: number
}>('form', { required: true })

const ldapBindPw = defineModel<string>('ldapBindPw', { required: true })
const ldapLookupUsername = defineModel<string>('ldapLookupUsername', { required: true })

const emit = defineEmits<{
  'test-bind': []
  'test-lookup': []
  save: []
  cancel: []
}>()

const { t } = useEsosI18n()

const ldapModeSummary = computed(() =>
  t(`admin.authProviders.ldapMode.${ldapConnectionModeKind(form.value.ldapUrl, form.value.ldapStartTls)}`),
)

const ldapCardTopWarning = computed(() =>
  ldapCardTopWarningFromForm({
    ldapEnabled:   form.value.ldapEnabled,
    ldapUrl:       form.value.ldapUrl,
    ldapStartTls:  form.value.ldapStartTls,
    ldapTlsVerify: form.value.ldapTlsVerify,
  }),
)

const ldapComplete = computed(() =>
  ldapConfigCompleteFromForm({
    ldapUrl:              form.value.ldapUrl,
    ldapBindDn:           form.value.ldapBindDn,
    ldapBaseDn:           form.value.ldapBaseDn,
    ldapUserSearchFilter: form.value.ldapUserSearchFilter,
    ldapBindPasswordSet:  props.data.ldap.bindPasswordSet,
  }),
)

const loginLdap = computed(() =>
  loginSummaryFromForm({
    ldapEnabled:          form.value.ldapEnabled,
    ldapUrl:              form.value.ldapUrl,
    ldapBindDn:           form.value.ldapBindDn,
    ldapBaseDn:           form.value.ldapBaseDn,
    ldapUserSearchFilter: form.value.ldapUserSearchFilter,
    ldapBindPasswordSet:  props.data.ldap.bindPasswordSet,
    oidcEnabled:          false,
    oidcIssuer:           '',
    oidcClientId:         '',
    oidcClientSecretSet:  false,
    jitEnabled:           props.data.auth.jitEnabled,
    ldapUserCount:        props.data.summary.counts.ldap,
    oidcUserCount:        0,
  }).ldap,
)
</script>

<template>
  <div class="space-y-8">
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-5 space-y-3">
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.ldap.statusTitle') }}
      </p>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.enableLabel') }}</dt>
          <dd class="font-medium">{{ form.ldapEnabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.urlLabel') }}</dt>
          <dd class="font-mono text-xs break-all">{{ truncateForSummary(form.ldapUrl, 56) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.modeSummaryLabel') }}</dt>
          <dd>{{ ldapModeSummary }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.configLabel') }}</dt>
          <dd>{{ ldapComplete ? t('admin.authProviders.summary.configComplete') : t('admin.authProviders.summary.configIncomplete') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.testResultLabel') }}</dt>
          <dd>
            {{
              lastLdapTest === null
                ? t('admin.authProviders.summary.testNotRun')
                : lastLdapTest.ok
                  ? t('admin.authProviders.summary.testOk')
                  : lastLdapTest.diagnostic
                    ? t(`admin.authProviders.ldap.diagnostics.steps.${lastLdapTest.diagnostic.step}`)
                    : lastLdapTest.error
            }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.loginOnSignIn') }}</dt>
          <dd>
            {{
              loginLdap.available
                ? t('admin.authProviders.summary.loginAvailable')
                : t('admin.authProviders.summary.loginHidden', {
                  reason: loginLdap.reason ? t(`admin.authProviders.summary.loginReason.${loginLdap.reason}`) : '',
                })
            }}
          </dd>
        </div>
      </dl>
    </div>

    <AuthProvidersSectionActions
      v-if="!readOnly"
      :dirty="dirty"
      :saving="saving"
      @save="emit('save')"
      @cancel="emit('cancel')"
    />

    <UCheckbox
      v-model="form.ldapEnabled"
      :disabled="readOnly"
      :label="t('admin.authProviders.ldap.enableLabel')"
      :help="t('admin.authProviders.ldap.enableHelp')"
    />

    <section class="space-y-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.sectionTransport') }}
      </h3>
      <UAlert
        v-if="ldapCardTopWarning"
        :color="ldapCardTopWarning.color"
        :icon="ldapCardTopWarning.icon"
        :title="t(`admin.authProviders.alerts.${ldapCardTopWarning.id}.title`)"
        :description="t(`admin.authProviders.alerts.${ldapCardTopWarning.id}.description`)"
      />
      <AppFormField :label="t('admin.authProviders.ldap.modeSummaryLabel')" :help="t('admin.authProviders.ldap.modeSummaryDesc')">
        <AppTextInput :model-value="ldapModeSummary" readonly />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.ldap.urlLabel')" :help="t('admin.authProviders.ldap.urlDesc')">
        <AppTextInput
          v-model="form.ldapUrl"
          :disabled="readOnly"
          class="font-mono"
          :placeholder="t('admin.authProviders.ldap.urlPlaceholder')"
        />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.ldap.startTlsLabel')" :help="t('admin.authProviders.ldap.startTlsDesc')">
        <UCheckbox v-model="form.ldapStartTls" :disabled="readOnly" :label="t('admin.authProviders.ldap.startTlsCheckbox')" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.ldap.tlsVerifyLabel')" :help="t('admin.authProviders.ldap.tlsVerifyDesc')">
        <UCheckbox v-model="form.ldapTlsVerify" :disabled="readOnly" :label="t('admin.authProviders.ldap.tlsVerifyCheckbox')" />
      </AppFormField>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.sectionBind') }}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppFormField :label="t('admin.authProviders.ldap.bindDnLabel')" :help="t('admin.authProviders.ldap.bindDnDesc')">
          <AppTextInput
            v-model="form.ldapBindDn"
            :disabled="readOnly"
            class="font-mono"
            :placeholder="t('admin.authProviders.ldap.bindDnPlaceholder')"
          />
        </AppFormField>
        <AppFormField :label="t('admin.authProviders.ldap.bindPasswordLabel')" :help="t('admin.authProviders.ldap.bindPasswordDesc')">
          <AppTextInput
            v-model="ldapBindPw"
            :disabled="readOnly"
            type="password"
            autocomplete="off"
            class="font-mono"
            :placeholder="t('admin.authProviders.ldap.bindPasswordPlaceholder')"
          />
          <div class="mt-2 flex flex-wrap gap-2">
            <UBadge v-if="data.ldap.bindPasswordSet" color="green" variant="subtle">
              {{ t('admin.authProviders.ldap.bindPwConfigured') }}
            </UBadge>
            <UBadge v-else color="gray" variant="subtle">
              {{ t('admin.authProviders.ldap.bindPwMissing') }}
            </UBadge>
          </div>
        </AppFormField>
      </div>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.sectionSearch') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.ldap.baseDnLabel')" :help="t('admin.authProviders.ldap.baseDnDesc')">
        <AppTextInput v-model="form.ldapBaseDn" :disabled="readOnly" class="font-mono" :placeholder="t('admin.authProviders.ldap.baseDnPlaceholder')" />
      </AppFormField>
      <AppFormField
        :label="t('admin.authProviders.ldap.userFilterLabel')"
        :help="t('admin.authProviders.ldap.userFilterDesc', { usernameMark: '{{username}}' })"
      >
        <AppTextInput
          v-model="form.ldapUserSearchFilter"
          :disabled="readOnly"
          class="font-mono"
          :placeholder="t('admin.authProviders.ldap.userFilterPlaceholder')"
        />
      </AppFormField>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppFormField
          :label="t('admin.authProviders.ldap.usernameAttrLabel')"
          :help="t('admin.authProviders.ldap.usernameAttrDesc', { usernameMark: '{{username}}' })"
        >
          <AppTextInput v-model="form.ldapUsernameAttribute" :disabled="readOnly" class="font-mono" />
        </AppFormField>
        <AppFormField :label="t('admin.authProviders.ldap.displayNameAttrLabel')" :help="t('admin.authProviders.ldap.displayNameAttrDesc')">
          <AppTextInput v-model="form.ldapDisplayNameAttribute" :disabled="readOnly" class="font-mono" />
        </AppFormField>
        <AppFormField :label="t('admin.authProviders.ldap.groupAttrLabel')" :help="t('admin.authProviders.ldap.groupAttrDesc')">
          <AppTextInput v-model="form.ldapGroupAttribute" :disabled="readOnly" class="font-mono" />
        </AppFormField>
        <AppFormField :label="t('admin.authProviders.ldap.timeoutLabel')" :help="t('admin.authProviders.ldap.timeoutDesc')">
          <AppTextInput v-model.number="form.ldapTimeoutSec" :disabled="readOnly" type="number" min="1" max="120" />
        </AppFormField>
      </div>
      <UAlert
        color="gray"
        icon="i-heroicons-queue-list"
        :title="t('admin.authProviders.ldap.searchLimitTitle')"
        :description="t('admin.authProviders.ldap.searchLimitDesc', { limit: LDAP_USER_SEARCH_SIZE_LIMIT })"
      />
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.testSection') }}
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('admin.authProviders.ldap.testDesc') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          :label="t('admin.authProviders.ldap.testButton')"
          icon="i-heroicons-arrow-path"
          :loading="testingLdap"
          :disabled="readOnly"
          color="primary"
          variant="outline"
          @click="emit('test-bind')"
        />
      </div>
      <AppFormField :label="t('admin.authProviders.ldap.testLookupLabel')" :help="t('admin.authProviders.ldap.testLookupDesc')">
        <div class="flex flex-col sm:flex-row gap-3">
          <AppTextInput
            v-model="ldapLookupUsername"
            :disabled="readOnly"
            class="flex-1"
            :placeholder="t('admin.authProviders.ldap.testLookupPlaceholder')"
          />
          <UButton
            :label="t('admin.authProviders.ldap.testLookupButton')"
            :loading="testingLdapLookup"
            :disabled="readOnly || !ldapLookupUsername.trim()"
            color="primary"
            variant="soft"
            @click="emit('test-lookup')"
          />
        </div>
      </AppFormField>
      <AuthProvidersLdapDiagnosticsPanel
        v-if="lastLdapTest?.diagnostic"
        :diagnostic="lastLdapTest.diagnostic"
        :ok="lastLdapTest.ok"
        :search-sample-count="lastLdapTest.ok ? lastLdapTest.searchSampleCount : undefined"
        :user-lookup="lastLdapTest.ok ? lastLdapTest.userLookup : undefined"
      />
    </section>
  </div>
</template>
