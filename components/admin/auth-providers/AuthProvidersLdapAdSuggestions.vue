<script setup lang="ts">
import { ldapAdFullPreset } from '~/utils/ldap-ad-defaults'

const props = defineProps<{
  url:    string
  bindDn: string
  baseDn: string
  readOnly: boolean
}>()

const emit = defineEmits<{
  applyPreset: []
  applyFilter:  [value: string]
  applyBaseDn:  [value: string]
  applyBindUpn: [value: string]
  applyBindNetbios: [value: string]
  applyUsernameAttr: [value: string]
  applyDisplayAttr: [value: string]
  applyGroupAttr: [value: string]
}>()

const { t } = useEsosI18n()

const preset = computed(() =>
  ldapAdFullPreset({
    url:    props.url,
    bindDn: props.bindDn,
    baseDn: props.baseDn,
  }),
)

function applyAll() {
  if (props.readOnly) return
  emit('applyPreset')
}
</script>

<template>
  <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-4 text-sm">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="font-semibold text-blue-900 dark:text-blue-200">
          {{ t('admin.authProviders.ldap.adAssistant.title') }}
        </p>
        <p class="mt-1 text-blue-800/80 dark:text-blue-300/80">
          {{ t('admin.authProviders.ldap.adAssistant.desc') }}
        </p>
      </div>
      <UButton
        v-if="!readOnly"
        size="sm"
        color="blue"
        variant="soft"
        icon="i-heroicons-sparkles"
        :label="t('admin.authProviders.ldap.adAssistant.applyAll')"
        class="shrink-0"
        @click="applyAll"
      />
    </div>

    <dl class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
      <div v-if="preset.domainFqdn">
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.domain') }}</dt>
        <dd class="mt-0.5 font-mono">{{ preset.domainFqdn }}</dd>
      </div>
      <div v-if="preset.baseDn">
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.baseDn') }}</dt>
        <dd class="mt-0.5 flex flex-wrap items-center gap-2">
          <code class="font-mono break-all">{{ preset.baseDn }}</code>
          <UButton
            v-if="!readOnly"
            size="2xs"
            color="blue"
            variant="ghost"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyBaseDn', preset.baseDn!)"
          />
        </dd>
      </div>
      <div class="md:col-span-2">
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.filter') }}</dt>
        <dd class="mt-0.5 flex flex-wrap items-start gap-2">
          <code class="font-mono break-all">{{ preset.userFilter }}</code>
          <UButton
            v-if="!readOnly"
            size="2xs"
            color="blue"
            variant="ghost"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyFilter', preset.userFilter)"
          />
        </dd>
      </div>
      <div>
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.loginAttr') }}</dt>
        <dd class="mt-0.5 font-mono">{{ preset.usernameAttribute }}</dd>
      </div>
      <div>
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.displayAttr') }}</dt>
        <dd class="mt-0.5 font-mono">{{ preset.displayNameAttribute }}</dd>
      </div>
      <div>
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.groupAttr') }}</dt>
        <dd class="mt-0.5 font-mono">{{ preset.groupAttribute }}</dd>
      </div>
      <div v-if="preset.bindUpn" class="md:col-span-2">
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.bindUpn') }}</dt>
        <dd class="mt-0.5 flex flex-wrap items-center gap-2">
          <code class="font-mono">{{ preset.bindUpn }}</code>
          <UButton
            v-if="!readOnly"
            size="2xs"
            color="blue"
            variant="ghost"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyBindUpn', preset.bindUpn!)"
          />
        </dd>
      </div>
      <div v-if="preset.bindNetbios" class="md:col-span-2">
        <dt class="font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adAssistant.bindNetbios') }}</dt>
        <dd class="mt-0.5 flex flex-wrap items-center gap-2">
          <code class="font-mono">{{ preset.bindNetbios }}</code>
          <UButton
            v-if="!readOnly"
            size="2xs"
            color="blue"
            variant="ghost"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyBindNetbios', preset.bindNetbios!)"
          />
        </dd>
      </div>
    </dl>
  </div>
</template>
