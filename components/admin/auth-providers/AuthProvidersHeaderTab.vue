<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import type { UserRole } from '~/server/utils/types'
import {
  headerConfigCompleteFromForm,
  loginSummaryFromForm,
  truncateForSummary,
} from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  data: AdminAuthProvidersDto
  readOnly: boolean
  dirty: boolean
  saving: boolean
}>()

const form = defineModel<{
  headerEnabled: boolean
  headerUserHeader: string
  headerEmailHeader: string
  headerGroupsHeader: string
  headerGroupsDelimiter: string
  headerDisplayNameHeader: string
  headerIssuer: string
  headerTokenHeader: string
  headerMaxRole: 'none' | UserRole
}>('form', { required: true })

const headerInternalToken = defineModel<string>('headerInternalToken', { required: true })

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const { t } = useEsosI18n()

const maxRoleItems = [
  { value: 'none', labelKey: 'admin.authProviders.maxRole.none' },
  { value: 'viewer', labelKey: 'admin.authProviders.roles.viewer' },
  { value: 'operator', labelKey: 'admin.authProviders.roles.operator' },
  { value: 'admin', labelKey: 'admin.authProviders.roles.admin' },
] as const

const headerTokenSet = computed(
  () => props.data.header.internalTokenSet || headerInternalToken.value.trim().length > 0,
)

const headerComplete = computed(() =>
  headerConfigCompleteFromForm({
    headerUserHeader:        form.value.headerUserHeader,
    headerIssuer:            form.value.headerIssuer,
    headerTokenHeader:       form.value.headerTokenHeader,
    headerInternalTokenSet:  headerTokenSet.value,
  }),
)

const loginHeader = computed(() =>
  loginSummaryFromForm({
    ldapEnabled:          false,
    ldapUrl:              '',
    ldapBindDn:           '',
    ldapBaseDn:           '',
    ldapUserSearchFilter: '',
    ldapBindPasswordSet:  false,
    oidcEnabled:          false,
    oidcIssuer:           '',
    oidcClientId:         '',
    oidcClientSecretSet:  false,
    headerEnabled:        form.value.headerEnabled,
    headerUserHeader:     form.value.headerUserHeader,
    headerIssuer:         form.value.headerIssuer,
    headerTokenHeader:    form.value.headerTokenHeader,
    headerInternalTokenSet: headerTokenSet.value,
    jitEnabled:           props.data.auth.jitEnabled,
    ldapUserCount:        0,
    oidcUserCount:        0,
    headerUserCount:      props.data.summary.counts.header,
  }).header,
)
</script>

<template>
  <div class="space-y-8">
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-5 space-y-3">
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.header.statusTitle') }}
      </p>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.header.enableLabel') }}</dt>
          <dd class="font-medium">{{ form.headerEnabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.header.issuerLabel') }}</dt>
          <dd class="font-mono text-xs break-all">{{ truncateForSummary(form.headerIssuer, 56) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.configLabel') }}</dt>
          <dd>{{ headerComplete ? t('admin.authProviders.summary.configComplete') : t('admin.authProviders.summary.configIncomplete') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.loginOnSignIn') }}</dt>
          <dd>
            {{
              loginHeader.available
                ? t('admin.authProviders.header.loginTransparent')
                : t('admin.authProviders.summary.loginHidden', {
                  reason: loginHeader.reason ? t(`admin.authProviders.summary.loginReason.${loginHeader.reason}`) : '',
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
      v-model="form.headerEnabled"
      :disabled="readOnly"
      :label="t('admin.authProviders.header.enableLabel')"
      :help="t('admin.authProviders.header.enableHelp')"
    />

    <section class="space-y-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.header.sectionTrust') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.header.tokenHeaderLabel')" :help="t('admin.authProviders.header.tokenHeaderDesc')">
        <AppTextInput v-model="form.headerTokenHeader" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.internalTokenLabel')" :help="t('admin.authProviders.header.internalTokenDesc')">
        <AppTextInput
          v-model="headerInternalToken"
          :disabled="readOnly"
          type="password"
          autocomplete="off"
          class="font-mono"
          :placeholder="t('admin.authProviders.header.internalTokenPlaceholder')"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <UBadge v-if="data.header.internalTokenSet" color="green" variant="subtle">{{ t('admin.authProviders.header.internalTokenConfigured') }}</UBadge>
          <UBadge v-else color="gray" variant="subtle">{{ t('admin.authProviders.header.internalTokenMissing') }}</UBadge>
        </div>
      </AppFormField>
      <UAlert
        color="blue"
        icon="i-heroicons-shield-check"
        :title="t('admin.authProviders.header.trustTitle')"
        :description="t('admin.authProviders.header.trustBody')"
      />
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.header.sectionIdentity') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.header.userHeaderLabel')" :help="t('admin.authProviders.header.userHeaderDesc')">
        <AppTextInput v-model="form.headerUserHeader" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.emailHeaderLabel')" :help="t('admin.authProviders.header.emailHeaderDesc')">
        <AppTextInput v-model="form.headerEmailHeader" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.groupsHeaderLabel')" :help="t('admin.authProviders.header.groupsHeaderDesc')">
        <AppTextInput v-model="form.headerGroupsHeader" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.groupsDelimiterLabel')" :help="t('admin.authProviders.header.groupsDelimiterDesc')">
        <AppTextInput v-model="form.headerGroupsDelimiter" :disabled="readOnly" class="font-mono w-24" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.displayNameHeaderLabel')" :help="t('admin.authProviders.header.displayNameHeaderDesc')">
        <AppTextInput v-model="form.headerDisplayNameHeader" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.header.issuerLabel')" :help="t('admin.authProviders.header.issuerDesc')">
        <AppTextInput v-model="form.headerIssuer" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.mapping.headerMaxRoleLabel')" :help="t('admin.authProviders.mapping.headerMaxRoleDesc')">
        <USelect
          v-model="form.headerMaxRole"
          :disabled="readOnly"
          :items="maxRoleItems.map((i) => ({ value: i.value, label: t(i.labelKey) }))"
          value-key="value"
          class="w-full"
        />
      </AppFormField>
    </section>
  </div>
</template>
