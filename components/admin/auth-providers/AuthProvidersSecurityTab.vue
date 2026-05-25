<script setup lang="ts">
import { authProviderSecurityAlerts } from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  readOnly: boolean
  dirty: boolean
  saving: boolean
  showOidcMfaRecommendation: boolean
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const form = defineModel<{
  ldapUrl: string
  ldapStartTls: boolean
  ldapTlsVerify: boolean
  ldapEnabled: boolean
  oidcIssuer: string
  oidcEnabled: boolean
  mfaMode: 'off' | 'idp_required' | 'idp_preferred'
  jitDefaultRole: string
  mappingRulesJson: string
}>('form', { required: true })

const { t } = useEsosI18n()

const securityAlerts = computed(() =>
  authProviderSecurityAlerts({
    ldapUrl:          form.value.ldapUrl,
    ldapStartTls:     form.value.ldapStartTls,
    ldapTlsVerify:    form.value.ldapTlsVerify,
    ldapEnabled:      form.value.ldapEnabled,
    oidcIssuer:       form.value.oidcIssuer,
    oidcEnabled:      form.value.oidcEnabled,
    mfaMode:          form.value.mfaMode,
    jitDefaultRole:   form.value.jitDefaultRole,
    mappingRulesJson: form.value.mappingRulesJson,
  }),
)

const mfaModeItems = computed(() => [
  { value: 'off' as const, label: t('admin.authProviders.mfa.off') },
  { value: 'idp_preferred' as const, label: t('admin.authProviders.mfa.idp_preferred') },
  { value: 'idp_required' as const, label: t('admin.authProviders.mfa.idp_required') },
])
</script>

<template>
  <div class="space-y-8">
    <AuthProvidersSectionActions
      v-if="!readOnly"
      :dirty="dirty"
      :saving="saving"
      @save="emit('save')"
      @cancel="emit('cancel')"
    />

    <p class="text-sm text-gray-600 dark:text-gray-400">
      {{ t('admin.authProviders.security.intro') }}
    </p>

    <section class="space-y-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.oidc.sectionSecurity') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.oidc.mfaPolicyLabel')" :help="t('admin.authProviders.oidc.mfaPolicyDesc')">
        <USelect v-model="form.mfaMode" :disabled="readOnly" :items="mfaModeItems" value-key="value" class="w-full max-w-md" />
      </AppFormField>
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
    </section>

    <section class="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.page.securityHeading') }}
      </h3>
      <UAlert
        v-for="(a, i) in securityAlerts"
        :key="i"
        :color="a.color"
        :icon="a.icon"
        :title="t(`admin.authProviders.alerts.${a.id}.title`)"
        :description="t(`admin.authProviders.alerts.${a.id}.description`)"
      />
      <p v-if="!securityAlerts.length" class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.security.noAlerts') }}
      </p>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.oidc.protectionsTitle') }}</p>
      <ul class="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm">
        <li class="flex gap-3 py-3 px-4">
          <UIcon name="i-heroicons-shield-check" class="size-5 text-green-600 shrink-0" />
          <div>
            <p class="font-medium">{{ t('admin.authProviders.oidc.pkceTitle') }}</p>
            <p class="text-gray-600 dark:text-gray-400 mt-0.5">{{ t('admin.authProviders.oidc.pkceBody') }}</p>
          </div>
        </li>
        <li class="flex gap-3 py-3 px-4">
          <UIcon name="i-heroicons-user" class="size-5 text-gray-500 shrink-0" />
          <div>
            <p class="font-medium">{{ t('admin.authProviders.oidc.correlationTitle') }}</p>
            <p class="text-gray-600 dark:text-gray-400 mt-0.5">{{ t('admin.authProviders.oidc.correlationBody') }}</p>
          </div>
        </li>
      </ul>
    </section>

    <UAlert
      color="gray"
      icon="i-heroicons-globe-alt"
      :title="t('admin.authProviders.security.loginVisibilityTitle')"
      :description="t('admin.authProviders.security.loginVisibilityDesc')"
    />
  </div>
</template>
