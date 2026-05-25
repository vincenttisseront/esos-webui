<script setup lang="ts">
import { ldapAdRecommendedDefaults } from '~/utils/ldap-ad-defaults'

const props = defineProps<{
  url:    string
  bindDn: string
  baseDn: string
  readOnly: boolean
}>()

const emit = defineEmits<{
  applyFilter:  [value: string]
  applyBaseDn:  [value: string]
  applyBindUpn: [value: string]
}>()

const { t } = useEsosI18n()

const defaults = computed(() =>
  ldapAdRecommendedDefaults({
    url:    props.url,
    bindDn: props.bindDn,
    baseDn: props.baseDn,
  }),
)
</script>

<template>
  <div class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-4 space-y-3 text-sm">
    <p class="font-semibold text-blue-900 dark:text-blue-200">
      {{ t('admin.authProviders.ldap.adDefaults.title') }}
    </p>
    <p class="text-blue-800/80 dark:text-blue-300/80">
      {{ t('admin.authProviders.ldap.adDefaults.desc') }}
    </p>
    <dl class="space-y-3">
      <div v-if="defaults.recommendedBaseDn">
        <dt class="text-xs font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adDefaults.baseDnLabel') }}</dt>
        <dd class="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
          <code class="text-xs font-mono break-all">{{ defaults.recommendedBaseDn }}</code>
          <UButton
            v-if="!readOnly"
            size="xs"
            color="blue"
            variant="soft"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyBaseDn', defaults.recommendedBaseDn!)"
          />
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adDefaults.filterLabel') }}</dt>
        <dd class="mt-1 flex flex-col sm:flex-row sm:items-start gap-2">
          <code class="text-xs font-mono break-all">{{ defaults.recommendedFilter }}</code>
          <UButton
            v-if="!readOnly"
            size="xs"
            color="blue"
            variant="soft"
            class="shrink-0"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyFilter', defaults.recommendedFilter)"
          />
        </dd>
      </div>
      <div v-if="defaults.recommendedBindUpn">
        <dt class="text-xs font-medium text-blue-700 dark:text-blue-400">{{ t('admin.authProviders.ldap.adDefaults.bindUpnLabel') }}</dt>
        <dd class="mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
          <code class="text-xs font-mono break-all">{{ defaults.recommendedBindUpn }}</code>
          <UButton
            v-if="!readOnly"
            size="xs"
            color="blue"
            variant="soft"
            :label="t('admin.authProviders.ldap.adDefaults.apply')"
            @click="emit('applyBindUpn', defaults.recommendedBindUpn!)"
          />
        </dd>
      </div>
    </dl>
  </div>
</template>
