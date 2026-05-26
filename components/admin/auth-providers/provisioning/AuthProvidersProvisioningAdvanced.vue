<script setup lang="ts">
import {
  MAPPING_RULES_JSON_EXAMPLE,
  parseMappingRulesJsonForUi,
  simulateLdapRoleMapping,
  simulateOidcRoleMapping,
} from '~/utils/auth-providers-admin-ui'
import type { UserRole } from '~/server/utils/types'

const props = defineProps<{
  readOnly: boolean
  dirty: boolean
  saving: boolean
  formValid: boolean
  /** When set, LDAP preview uses directory groups instead of the textarea. */
  previewGroupsFromSelection?: string[]
}>()

const emit = defineEmits<{
  save: []
  cancel: []
}>()

const form = defineModel<{
  jitEnabled: boolean
  jitDefaultRole: UserRole
  jitDefaultActive: boolean
  mappingRulesJson: string
  oidcMaxRole: 'none' | UserRole
  ldapMaxRole: 'none' | UserRole
}>('form', { required: true })

const { t } = useEsosI18n()

const mappingJsonStatus = computed(() => parseMappingRulesJsonForUi(form.value.mappingRulesJson))

const jitRoleItems = computed(() => [
  { value: 'viewer' as const, label: t('admin.authProviders.roles.viewer') },
  { value: 'operator' as const, label: t('admin.authProviders.roles.operator') },
  { value: 'admin' as const, label: t('admin.authProviders.roles.admin') },
])

const maxRoleItems = computed(() => [
  { value: 'none' as const, label: t('admin.authProviders.maxRole.none') },
  { value: 'viewer' as const, label: t('admin.authProviders.roles.viewer') },
  { value: 'operator' as const, label: t('admin.authProviders.roles.operator') },
  { value: 'admin' as const, label: t('admin.authProviders.roles.admin') },
])

const showExample = ref(false)

const previewClaimsJson = ref('{\n  "groups": ["ESOS-Admins"]\n}')
const previewGroupDns = ref('CN=ESOS-Operators,OU=Groups,DC=example,DC=com')
const oidcPreview = ref<{ effectiveRole: string; ruleIndex: number | null } | null>(null)
const ldapPreview = ref<{ effectiveRole: string; ruleIndex: number | null } | null>(null)
const oidcPreviewError = ref<string | null>(null)
const ldapPreviewError = ref<string | null>(null)

function maxRoleValue(v: 'none' | UserRole): UserRole | null {
  return v === 'none' ? null : v
}

function runOidcPreview() {
  oidcPreviewError.value = null
  oidcPreview.value = null
  const r = simulateOidcRoleMapping({
    claimsJson:         previewClaimsJson.value,
    mappingRulesJson:   form.value.mappingRulesJson,
    defaultRole:        form.value.jitDefaultRole,
    maxRole:            maxRoleValue(form.value.oidcMaxRole),
  })
  if (!r.ok) {
    oidcPreviewError.value = t(`admin.authProviders.mapping.preview.error_${r.code}`)
    return
  }
  oidcPreview.value = {
    effectiveRole: r.result.effectiveRole,
    ruleIndex:     r.result.matchedRuleIndex,
  }
}

function runLdapPreview() {
  ldapPreviewError.value = null
  ldapPreview.value = null
  const groupDnsText = props.previewGroupsFromSelection?.length
    ? props.previewGroupsFromSelection.join('\n')
    : previewGroupDns.value
  const r = simulateLdapRoleMapping({
    groupDnsText,
    mappingRulesJson: form.value.mappingRulesJson,
    defaultRole:      form.value.jitDefaultRole,
    maxRole:          maxRoleValue(form.value.ldapMaxRole),
  })
  if (!r.ok) {
    ldapPreviewError.value = t('admin.authProviders.mapping.preview.error_invalid_rules')
    return
  }
  ldapPreview.value = {
    effectiveRole: r.result.effectiveRole,
    ruleIndex:     r.result.matchedRuleIndex,
  }
}

watch(
  () => props.previewGroupsFromSelection,
  (groups) => {
    if (groups?.length) runLdapPreview()
  },
)
</script>

<template>
  <div class="space-y-8">
    <AuthProvidersSectionActions
      v-if="!readOnly"
      :dirty="dirty"
      :saving="saving"
      :form-valid="formValid"
      @save="emit('save')"
      @cancel="emit('cancel')"
    />

    <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
      {{ t('admin.authProviders.mapping.cardSubtitle') }}
    </p>

    <section class="space-y-4">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.mapping.jitSection') }}
      </h3>
      <UCheckbox
        v-model="form.jitEnabled"
        :disabled="readOnly"
        :label="t('admin.authProviders.mapping.jitEnableLabel')"
        :help="t('admin.authProviders.mapping.jitEnableHelp')"
      />
      <AppFormField :label="t('admin.authProviders.mapping.jitDefaultRoleLabel')" :help="t('admin.authProviders.mapping.jitDefaultRoleDesc')">
        <USelect v-model="form.jitDefaultRole" :disabled="readOnly" :items="jitRoleItems" value-key="value" class="w-full max-w-md" />
      </AppFormField>
      <AppFormField :label="t('admin.authProviders.mapping.jitActiveLabel')" :help="t('admin.authProviders.mapping.jitActiveDesc')">
        <UCheckbox v-model="form.jitDefaultActive" :disabled="readOnly" :label="t('admin.authProviders.mapping.jitActiveCheckbox')" />
      </AppFormField>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.mapping.capsSection') }}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AppFormField :label="t('admin.authProviders.mapping.oidcMaxRoleLabel')" :help="t('admin.authProviders.mapping.oidcMaxRoleDesc')">
          <USelect v-model="form.oidcMaxRole" :disabled="readOnly" :items="maxRoleItems" value-key="value" class="w-full" />
        </AppFormField>
        <AppFormField :label="t('admin.authProviders.mapping.ldapMaxRoleLabel')" :help="t('admin.authProviders.mapping.ldapMaxRoleDesc')">
          <USelect v-model="form.ldapMaxRole" :disabled="readOnly" :items="maxRoleItems" value-key="value" class="w-full" />
        </AppFormField>
      </div>
    </section>

    <section class="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.mapping.rulesJsonLabel') }}
      </h3>
      <AppFormField
        :label="t('admin.authProviders.mapping.rulesJsonLabel')"
        :help="t('admin.authProviders.mapping.rulesJsonDesc')"
        :error="mappingJsonStatus.ok ? undefined : t(`admin.authProviders.jsonErrors.${mappingJsonStatus.code}`)"
      >
        <UTextarea
          v-model="form.mappingRulesJson"
          :disabled="readOnly"
          :rows="10"
          class="w-full font-mono text-sm"
        />
      </AppFormField>
      <button
        type="button"
        class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        @click="showExample = !showExample"
      >
        {{ showExample ? t('admin.authProviders.mapping.hideExample') : t('admin.authProviders.mapping.exampleLabel') }}
      </button>
      <UTextarea
        v-if="showExample"
        :model-value="MAPPING_RULES_JSON_EXAMPLE"
        readonly
        :rows="5"
        class="w-full font-mono text-xs bg-gray-50 dark:bg-gray-950"
      />
    </section>

    <section class="space-y-6 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.mapping.preview.title') }}
      </h3>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.mapping.preview.oidcTitle') }}</p>
          <UTextarea v-model="previewClaimsJson" :rows="6" class="font-mono text-xs w-full" :disabled="readOnly" />
          <UButton :label="t('admin.authProviders.mapping.preview.simulate')" size="sm" :disabled="readOnly" @click="runOidcPreview" />
          <p v-if="oidcPreviewError" class="text-sm text-red-600">{{ oidcPreviewError }}</p>
          <p v-else-if="oidcPreview" class="text-sm text-gray-700 dark:text-gray-300">
            {{ t('admin.authProviders.mapping.preview.effectiveRole', { role: oidcPreview.effectiveRole }) }}
            <span v-if="oidcPreview.ruleIndex != null" class="block text-xs text-gray-500 mt-1">
              {{ t('admin.authProviders.mapping.preview.matchedRule', { index: oidcPreview.ruleIndex }) }}
            </span>
            <span v-else class="block text-xs text-gray-500 mt-1">{{ t('admin.authProviders.mapping.preview.defaultRule') }}</span>
          </p>
        </div>
        <div class="space-y-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ t('admin.authProviders.mapping.preview.ldapTitle') }}</p>
          <p v-if="previewGroupsFromSelection?.length" class="text-xs text-gray-500">
            {{ t('admin.authProviders.provisioning.preview.fromSelection', { count: previewGroupsFromSelection.length }) }}
          </p>
          <UTextarea
            v-else
            v-model="previewGroupDns"
            :rows="6"
            class="font-mono text-xs w-full"
            :disabled="readOnly"
          />
          <UButton :label="t('admin.authProviders.mapping.preview.simulate')" size="sm" :disabled="readOnly" @click="runLdapPreview" />
          <p v-if="ldapPreviewError" class="text-sm text-red-600">{{ ldapPreviewError }}</p>
          <p v-else-if="ldapPreview" class="text-sm text-gray-700 dark:text-gray-300">
            {{ t('admin.authProviders.mapping.preview.effectiveRole', { role: ldapPreview.effectiveRole }) }}
            <span v-if="ldapPreview.ruleIndex != null" class="block text-xs text-gray-500 mt-1">
              {{ t('admin.authProviders.mapping.preview.matchedRule', { index: ldapPreview.ruleIndex }) }}
            </span>
            <span v-else class="block text-xs text-gray-500 mt-1">{{ t('admin.authProviders.mapping.preview.defaultRule') }}</span>
          </p>
        </div>
      </div>
    </section>

    <section class="pt-4 border-t border-gray-100 dark:border-gray-800">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.provisioning.oidcComingSoon') }}
      </p>
    </section>
  </div>
</template>
