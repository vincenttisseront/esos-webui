<script setup lang="ts">
import type { AdminAuthProvidersDto } from '~/server/utils/auth-providers-config'
import {
  loginSummaryFromForm,
  oidcCallbackPreview,
  oidcConfigCompleteFromForm,
  truncateForSummary,
  type OidcTestClientState,
} from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  data: AdminAuthProvidersDto
  readOnly: boolean
  dirty: boolean
  saving: boolean
  oidcSecret: string
  publicOrigin: string
  lastOidcTest: OidcTestClientState
  testingOidc: boolean
}>()

const form = defineModel<{
  oidcEnabled: boolean
  oidcIssuer: string
  oidcClientId: string
  oidcScopes: string
  oidcRedirectPath: string
  oidcClockSkewSec: number
}>('form', { required: true })

const oidcSecret = defineModel<string>('oidcSecret', { required: true })

const emit = defineEmits<{
  'test-discovery': []
  'go-roles-tab': []
  save: []
  cancel: []
}>()

const { t } = useEsosI18n()
const { success: toastOk } = useAppToast()

const oidcCallbackFullUrl = computed(() =>
  oidcCallbackPreview(props.publicOrigin, form.value.oidcRedirectPath),
)

const oidcComplete = computed(() =>
  oidcConfigCompleteFromForm({
    oidcIssuer:          form.value.oidcIssuer,
    oidcClientId:        form.value.oidcClientId,
    oidcClientSecretSet: props.data.oidc.clientSecretSet,
  }),
)

const loginOidc = computed(() =>
  loginSummaryFromForm({
    ldapEnabled:          false,
    ldapUrl:              '',
    ldapBindDn:           '',
    ldapBaseDn:           '',
    ldapUserSearchFilter: '',
    ldapBindPasswordSet:  false,
    oidcEnabled:          form.value.oidcEnabled,
    oidcIssuer:           form.value.oidcIssuer,
    oidcClientId:         form.value.oidcClientId,
    oidcClientSecretSet:  props.data.oidc.clientSecretSet,
    jitEnabled:           props.data.auth.jitEnabled,
    ldapUserCount:        0,
    oidcUserCount:        props.data.summary.counts.oidc,
  }).oidc,
)

const canTestLogin = computed(() => form.value.oidcEnabled && oidcComplete.value && loginOidc.value.available)

async function copyCallback() {
  if (!oidcCallbackFullUrl.value || !import.meta.client) return
  try {
    await navigator.clipboard.writeText(oidcCallbackFullUrl.value)
    toastOk(t('admin.authProviders.oidc.callbackCopiedTitle'), t('admin.authProviders.oidc.callbackCopiedBody'))
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="space-y-8">
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/50 p-5 space-y-3">
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {{ t('admin.authProviders.oidc.statusTitle') }}
      </p>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.oidc.enableLabel') }}</dt>
          <dd class="font-medium">{{ form.oidcEnabled ? t('admin.authProviders.summary.enabled') : t('admin.authProviders.summary.disabled') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.oidc.issuerLabel') }}</dt>
          <dd class="font-mono text-xs break-all">{{ truncateForSummary(form.oidcIssuer, 56) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.configLabel') }}</dt>
          <dd>{{ oidcComplete ? t('admin.authProviders.summary.configComplete') : t('admin.authProviders.summary.configIncomplete') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.oidc.discoveryLabel') }}</dt>
          <dd>
            {{
              lastOidcTest === null
                ? t('admin.authProviders.summary.testNotRun')
                : lastOidcTest.ok
                  ? t('admin.authProviders.summary.discoveryOk')
                  : lastOidcTest.error
            }}
          </dd>
        </div>
        <div>
          <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.summary.loginOnSignIn') }}</dt>
          <dd>
            {{
              loginOidc.available
                ? t('admin.authProviders.summary.loginAvailable')
                : t('admin.authProviders.summary.loginHidden', {
                  reason: loginOidc.reason ? t(`admin.authProviders.summary.loginReason.${loginOidc.reason}`) : '',
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
      v-model="form.oidcEnabled"
      :disabled="readOnly"
      :label="t('admin.authProviders.oidc.enableLabel')"
      :help="t('admin.authProviders.oidc.enableHelp')"
    />

    <section class="space-y-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.oidc.sectionConnection') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.oidc.issuerLabel')" :help="t('admin.authProviders.oidc.issuerDesc')">
        <AppTextInput v-model="form.oidcIssuer" :disabled="readOnly" class="font-mono" :placeholder="t('admin.authProviders.oidc.issuerPlaceholder')" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.oidc.clientIdLabel')" :help="t('admin.authProviders.oidc.clientIdDesc')">
        <AppTextInput v-model="form.oidcClientId" :disabled="readOnly" :placeholder="t('admin.authProviders.oidc.clientIdPlaceholder')" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.oidc.clientSecretLabel')" :help="t('admin.authProviders.oidc.clientSecretDesc')">
        <AppTextInput
          v-model="oidcSecret"
          :disabled="readOnly"
          type="password"
          autocomplete="off"
          class="font-mono"
          :placeholder="t('admin.authProviders.oidc.clientSecretPlaceholder')"
        />
        <div class="mt-2 flex flex-wrap gap-2">
          <UBadge v-if="data.oidc.clientSecretSet" color="green" variant="subtle">{{ t('admin.authProviders.oidc.secretConfigured') }}</UBadge>
          <UBadge v-else color="gray" variant="subtle">{{ t('admin.authProviders.oidc.secretMissing') }}</UBadge>
        </div>
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.oidc.redirectPathLabel')" :help="t('admin.authProviders.oidc.redirectPathDesc')">
        <AppTextInput v-model="form.oidcRedirectPath" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField v-if="oidcCallbackFullUrl" :label="t('admin.authProviders.oidc.callbackPreviewLabel')" :help="t('admin.authProviders.oidc.callbackPreviewDesc')">
        <div class="flex gap-2">
          <AppTextInput :model-value="oidcCallbackFullUrl" readonly class="font-mono flex-1" />
          <UButton
            icon="i-heroicons-clipboard-document"
            color="gray"
            variant="soft"
            :aria-label="t('admin.authProviders.oidc.copyCallback')"
            @click="copyCallback"
          />
        </div>
      </AppFormField>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.oidc.sectionClaims') }}
      </h3>
      <AppFormField :label="t('admin.authProviders.oidc.scopesLabel')" :help="t('admin.authProviders.oidc.scopesDesc')">
        <AppTextInput v-model="form.oidcScopes" :disabled="readOnly" class="font-mono" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.oidc.clockSkewLabel')" :help="t('admin.authProviders.oidc.clockSkewDesc')">
        <AppTextInput v-model.number="form.oidcClockSkewSec" :disabled="readOnly" type="number" min="0" max="600" />
      </AppFormField>
      <UAlert
        color="gray"
        icon="i-heroicons-user"
        :title="t('admin.authProviders.oidc.correlationTitle')"
        :description="t('admin.authProviders.oidc.correlationBody')"
      />
      <button
        type="button"
        class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        @click="emit('go-roles-tab')"
      >
        {{ t('admin.authProviders.oidc.goRolesMapping') }}
      </button>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.oidc.testSection') }}
      </h3>
      <p class="text-sm text-gray-600 dark:text-gray-400">{{ t('admin.authProviders.oidc.testDesc') }}</p>
      <div class="flex flex-wrap gap-3">
        <UButton
          :label="t('admin.authProviders.oidc.testButton')"
          icon="i-heroicons-arrow-path"
          :loading="testingOidc"
          :disabled="readOnly"
          color="primary"
          variant="outline"
          @click="emit('test-discovery')"
        />
        <UButton
          v-if="canTestLogin"
          :label="t('admin.authProviders.oidc.testLoginButton')"
          icon="i-heroicons-arrow-top-right-on-square"
          color="gray"
          variant="soft"
          to="/api/auth/oidc/login"
          target="_blank"
        />
      </div>
      <div
        v-if="lastOidcTest"
        class="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-950/50 text-sm space-y-2"
      >
        <template v-if="lastOidcTest.ok">
          <p class="text-green-700 dark:text-green-400 font-medium">{{ t('admin.authProviders.toasts.oidcDiscoveryOk') }}</p>
          <ul class="font-mono text-xs text-gray-700 dark:text-gray-300 space-y-1">
            <li>authorization_endpoint: {{ lastOidcTest.authorizationEndpoint ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}</li>
            <li>token_endpoint: {{ lastOidcTest.tokenEndpoint ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}</li>
            <li>jwks_uri: {{ lastOidcTest.jwksUri ? t('admin.authProviders.save.present') : t('admin.authProviders.save.absent') }}</li>
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
    </section>
  </div>
</template>
