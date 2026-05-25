<script setup lang="ts">
import type { LdapTestDiagnostic } from '~/server/utils/ldap-diagnostics'
import { formatLdapDiagnosticForCopy } from '~/server/utils/ldap-diagnostics'

const props = defineProps<{
  diagnostic: LdapTestDiagnostic
  ok: boolean
  bindOnly?: boolean
  searchSampleCount?: number
  userLookup?: boolean
}>()

const { t } = useEsosI18n()
const { success: toastOk } = useAppToast()

const summaryTitle = computed(() => {
  if (props.ok && props.bindOnly) {
    return t('admin.authProviders.ldap.diagnostics.bindSuccessTitle')
  }
  if (props.ok && props.userLookup === true) {
    return t('admin.authProviders.ldap.diagnostics.searchSuccessTitle')
  }
  if (props.ok && props.userLookup === false) {
    return t('admin.authProviders.ldap.diagnostics.userNotFoundTitle')
  }
  return props.ok
    ? t('admin.authProviders.ldap.diagnostics.successTitle')
    : t('admin.authProviders.ldap.diagnostics.failureTitle')
})

const safeCodeLabel = computed(() =>
  t(`admin.authProviders.ldap.diagnostics.codes.${props.diagnostic.safeCode}`),
)

const stepLabel = computed(() =>
  t(`admin.authProviders.ldap.diagnostics.steps.${props.diagnostic.step}`),
)

const hintLines = computed(() =>
  props.diagnostic.hints.map((id) => t(`admin.authProviders.ldap.diagnostics.hints.${id}`)),
)

const commandLines = computed(() => {
  const lines: string[] = []
  if (props.diagnostic.commandExamples?.ldapsearch) {
    lines.push(props.diagnostic.commandExamples.ldapsearch)
  }
  if (props.diagnostic.commandExamples?.openssl) {
    lines.push(props.diagnostic.commandExamples.openssl)
  }
  return lines
})

async function copyDiagnostic() {
  if (!import.meta.client) return
  const text = formatLdapDiagnosticForCopy(props.diagnostic, {
    summaryLabel:   summaryTitle.value,
    failedStep:     t('admin.authProviders.ldap.diagnostics.failedStep'),
    stepLabel:      stepLabel.value,
    safeMessage:    t('admin.authProviders.ldap.diagnostics.safeMessage'),
    errorName:      t('admin.authProviders.ldap.diagnostics.errorName'),
    errorCode:      t('admin.authProviders.ldap.diagnostics.errorCode'),
    configTitle:    t('admin.authProviders.ldap.diagnostics.configTitle'),
    hintsTitle:     t('admin.authProviders.ldap.diagnostics.hintsTitle'),
    hintLines:      hintLines.value,
    commandsTitle:  t('admin.authProviders.ldap.diagnostics.commandsTitle'),
    commandLines:   commandLines.value,
  })
  try {
    await navigator.clipboard.writeText(text)
    toastOk(
      t('admin.authProviders.ldap.diagnostics.copyTitle'),
      t('admin.authProviders.ldap.diagnostics.copyBody'),
    )
  } catch { /* ignore */ }
}
</script>

<template>
  <div
    class="rounded-lg border p-4 space-y-4 text-sm"
    :class="ok && !bindOnly && userLookup === false
      ? 'border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30'
      : ok
        ? 'border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-950/30'
        : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'"
  >
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="space-y-1 min-w-0">
        <p class="font-semibold" :class="ok && userLookup === false
          ? 'text-amber-800 dark:text-amber-300'
          : ok
            ? 'text-green-800 dark:text-green-300'
            : 'text-red-800 dark:text-red-300'">
          {{ summaryTitle }}
        </p>
        <p v-if="ok && bindOnly" class="text-green-700 dark:text-green-400">
          {{ t('admin.authProviders.ldap.diagnostics.bindOnlyBody') }}
        </p>
        <p v-if="ok && bindOnly" class="text-sm text-gray-600 dark:text-gray-400">
          {{ t('admin.authProviders.ldap.testLookupPrompt') }}
        </p>
        <p v-if="ok && !bindOnly && userLookup === true" class="text-green-700 dark:text-green-400">
          {{ t('admin.authProviders.ldap.testLookupFound') }}
        </p>
        <p v-if="ok && !bindOnly && userLookup === false" class="text-amber-700 dark:text-amber-400">
          {{ t('admin.authProviders.ldap.testLookupNotFound') }}
        </p>
        <p v-if="ok && diagnostic.config.userFilter && !bindOnly" class="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
          {{ t('admin.authProviders.ldap.diagnostics.renderedFilter') }}: {{ diagnostic.config.userFilter }}
        </p>
        <template v-if="!ok">
          <p class="text-red-700 dark:text-red-300">
            <span class="font-medium">{{ t('admin.authProviders.ldap.diagnostics.failedStep') }}:</span>
            {{ stepLabel }}
          </p>
          <p class="text-gray-800 dark:text-gray-200">{{ diagnostic.safeMessage }}</p>
          <p class="text-xs text-gray-600 dark:text-gray-400">{{ safeCodeLabel }}</p>
        </template>
      </div>
      <UButton
        size="sm"
        color="gray"
        variant="soft"
        icon="i-heroicons-clipboard-document"
        :label="t('admin.authProviders.ldap.diagnostics.copyButton')"
        class="shrink-0"
        @click="copyDiagnostic"
      />
    </div>

    <dl
      v-if="!ok && (diagnostic.ldapErrorName || diagnostic.ldapErrorCode !== undefined)"
      class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono"
    >
      <div v-if="diagnostic.ldapErrorName">
        <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.diagnostics.errorName') }}</dt>
        <dd>{{ diagnostic.ldapErrorName }}</dd>
      </div>
      <div v-if="diagnostic.ldapErrorCode !== undefined">
        <dt class="text-gray-500 dark:text-gray-400">{{ t('admin.authProviders.ldap.diagnostics.errorCode') }}</dt>
        <dd>{{ diagnostic.ldapErrorCode }}</dd>
      </div>
    </dl>

    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.diagnostics.configTitle') }}
      </p>
      <dl class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.urlLabel') }}</dt>
          <dd class="font-mono break-all">{{ diagnostic.config.serverUrl }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.diagnostics.tlsMode') }}</dt>
          <dd>{{ t(`admin.authProviders.ldapMode.${diagnostic.config.tlsMode}`) }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.tlsVerifyLabel') }}</dt>
          <dd>{{ diagnostic.config.verifyTls ? t('admin.authProviders.ldap.diagnostics.verifyTlsOn') : t('admin.authProviders.ldap.diagnostics.verifyTlsOff') }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.bindDnLabel') }}</dt>
          <dd class="font-mono">{{ diagnostic.config.bindPrincipal }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.baseDnLabel') }}</dt>
          <dd class="font-mono break-all">{{ diagnostic.config.baseDn }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.userFilterLabel') }}</dt>
          <dd class="font-mono break-all">{{ diagnostic.config.userFilter }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.usernameAttrLabel') }}</dt>
          <dd class="font-mono">{{ diagnostic.config.loginAttribute }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.groupAttrLabel') }}</dt>
          <dd class="font-mono">{{ diagnostic.config.groupAttribute }}</dd>
        </div>
        <div>
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.timeoutLabel') }}</dt>
          <dd>{{ diagnostic.config.timeoutSec }}s</dd>
        </div>
        <div v-if="diagnostic.config.lookupUsername">
          <dt class="text-gray-500">{{ t('admin.authProviders.ldap.diagnostics.lookupUser') }}</dt>
          <dd class="font-mono">{{ diagnostic.config.lookupUsername }}</dd>
        </div>
      </dl>
    </div>

    <div v-if="hintLines.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.diagnostics.hintsTitle') }}
      </p>
      <ul class="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-300">
        <li v-for="(line, i) in hintLines" :key="i">{{ line }}</li>
      </ul>
    </div>

    <div v-if="commandLines.length" class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.diagnostics.commandsTitle') }}
      </p>
      <pre
        v-for="(cmd, i) in commandLines"
        :key="i"
        class="overflow-x-auto rounded-md bg-gray-900 text-gray-100 p-3 text-xs font-mono"
      >{{ cmd }}</pre>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        {{ t('admin.authProviders.ldap.diagnostics.commandsNote') }}
      </p>
    </div>
  </div>
</template>
