<script setup lang="ts">
import {
  applyLdapConnectionModeChoice,
  ldapConnectionModeChoiceFromForm,
  type LdapConnectionModeChoice,
} from '~/utils/auth-providers-admin-ui'

const props = defineProps<{
  readOnly: boolean
}>()

const ldapUrl = defineModel<string>('ldapUrl', { required: true })
const ldapStartTls = defineModel<boolean>('ldapStartTls', { required: true })

const { t } = useEsosI18n()

const MODES: LdapConnectionModeChoice[] = ['ldaps', 'starttls', 'plain']

const selectedMode = computed(() =>
  ldapConnectionModeChoiceFromForm(ldapUrl.value, ldapStartTls.value),
)

function selectMode(mode: LdapConnectionModeChoice) {
  if (props.readOnly || mode === selectedMode.value) return
  const target = { ldapUrl: ldapUrl.value, ldapStartTls: ldapStartTls.value }
  applyLdapConnectionModeChoice(target, mode)
  ldapUrl.value = target.ldapUrl
  ldapStartTls.value = target.ldapStartTls
}

function modeCardClass(mode: LdapConnectionModeChoice) {
  const selected = mode === selectedMode.value
  return [
    'rounded-lg border p-4 text-left transition-colors',
    selected
      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 ring-1 ring-primary-500'
      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
    props.readOnly ? 'cursor-default opacity-80' : 'cursor-pointer',
  ]
}
</script>

<template>
  <AppFormField
    :label="t('admin.authProviders.ldap.connectionMode.label')"
    :help="t('admin.authProviders.ldap.connectionMode.help')"
  >
    <div
      role="radiogroup"
      :aria-label="t('admin.authProviders.ldap.connectionMode.label')"
      class="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <button
        v-for="mode in MODES"
        :key="mode"
        type="button"
        role="radio"
        :aria-checked="selectedMode === mode"
        :disabled="readOnly"
        :class="modeCardClass(mode)"
        @click="selectMode(mode)"
      >
        <span class="flex items-start gap-2">
          <span
            class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border"
            :class="selectedMode === mode
              ? 'border-primary-500 bg-primary-500'
              : 'border-gray-300 dark:border-gray-600'"
          >
            <span
              v-if="selectedMode === mode"
              class="h-1.5 w-1.5 rounded-full bg-white"
            />
          </span>
          <span class="min-w-0 space-y-1">
            <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ t(`admin.authProviders.ldap.connectionMode.options.${mode}.label`) }}
            </span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              {{ t(`admin.authProviders.ldap.connectionMode.options.${mode}.help`) }}
            </span>
          </span>
        </span>
      </button>
    </div>

    <UAlert
      v-if="selectedMode === 'plain'"
      class="mt-3"
      color="red"
      icon="i-heroicons-exclamation-triangle"
      :title="t('admin.authProviders.ldap.connectionMode.plainWarning.title')"
      :description="t('admin.authProviders.ldap.connectionMode.plainWarning.description')"
    />
  </AppFormField>
</template>
