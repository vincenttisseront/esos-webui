<template>
  <div
    class="rounded-lg border border-blue-200 dark:border-blue-500/40 bg-blue-50/80 dark:bg-blue-500/10 px-4 py-3 space-y-3"
    role="region"
    :aria-label="t('raid.hw_create_wizard.compat.title')"
  >
    <div class="flex flex-wrap items-center gap-2">
      <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
      <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-100">
        {{ t('raid.hw_create_wizard.compat.title') }}
      </h4>
      <UBadge color="info" variant="subtle" size="xs">
        {{ t('raid.hw_create_wizard.compat.badge_info') }}
      </UBadge>
      <UBadge v-if="!isBlocking" color="success" variant="subtle" size="xs">
        {{ t('raid.hw_create_wizard.compat.badge_not_blocking') }}
      </UBadge>
    </div>

    <p class="text-sm text-blue-900/90 dark:text-blue-100/90">
      {{ introText }}
    </p>

    <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.cli_detected') }}</dt>
        <dd class="font-mono text-xs text-blue-950 dark:text-blue-50 break-all">{{ cliDetectedLabel }}</dd>
      </div>
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.syntax_mode') }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ syntaxModeLabel }}</dd>
      </div>
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.raid_level') }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ raidLevelLabel }}</dd>
      </div>
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.selected_disks') }}</dt>
        <dd class="font-mono text-xs text-blue-950 dark:text-blue-50">{{ selectedDisksLabel }}</dd>
      </div>
      <div v-if="volumeName">
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ volumeNameFieldLabel }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ volumeNameFieldValue }}</dd>
      </div>
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.read_policy') }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ readPolicyLabel }}</dd>
      </div>
      <div>
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.write_policy') }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ writePolicyLabel }}</dd>
      </div>
      <div class="sm:col-span-2">
        <dt class="text-blue-700/80 dark:text-blue-300/80 text-xs font-medium">{{ t('raid.hw_create_wizard.compat.cache_policy') }}</dt>
        <dd class="text-blue-950 dark:text-blue-50">{{ cachePolicyLabel }}</dd>
      </div>
    </dl>

    <div class="space-y-1">
      <p class="text-xs font-medium text-blue-800 dark:text-blue-200">{{ t('raid.hw_create_wizard.compat.command_label') }}</p>
      <code class="block text-xs font-mono break-all rounded bg-white/70 dark:bg-gray-950/60 border border-blue-200/60 dark:border-blue-500/30 px-2 py-2 text-gray-900 dark:text-gray-100">
        {{ command }}
      </code>
    </div>

    <ul class="text-xs text-blue-900/85 dark:text-blue-100/85 space-y-1.5 list-disc list-inside">
      <li v-for="(point, i) in bulletPoints" :key="i">{{ point }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  command: string
  raidLevel: string
  drives: Array<{ enclosure?: string; slot: string }>
  cliTool: string
  cliPath?: string
  readPolicy: string
  writePolicy: string
  volumeName?: string
  /** When false, name is applied after create (perccli), not in the command below */
  volumeNameOnCreate?: boolean
}>()

const { t } = useI18n()

const isPerccliMinimal = computed(() => props.cliTool === 'perccli')
const isStorcliFull = computed(() => props.cliTool === 'storcli')
const isBlocking = false

const cliDetectedLabel = computed(() => {
  const path = props.cliPath ?? props.cliTool
  if (isPerccliMinimal.value) {
    return t('raid.hw_create_wizard.compat.cli_perccli_detected', { path })
  }
  if (isStorcliFull.value) {
    return t('raid.hw_create_wizard.compat.cli_storcli_detected', { path })
  }
  return path
})

const syntaxModeLabel = computed(() =>
  isPerccliMinimal.value
    ? t('raid.hw_create_wizard.compat.syntax_minimal')
    : t('raid.hw_create_wizard.compat.syntax_full'),
)

const raidLevelLabel = computed(() =>
  t(`raid.hw_create_wizard.levels.${props.raidLevel}.title`),
)

const selectedDisksLabel = computed(() =>
  props.drives.map(d => `${d.enclosure ?? '252'}:${d.slot}`).join(', ') || '—',
)

const policyDefaultLabel = computed(() =>
  t('raid.hw_create_wizard.compat.policy_controller_default'),
)

const readPolicyLabel = computed(() =>
  isPerccliMinimal.value ? policyDefaultLabel.value : props.readPolicy,
)

const writePolicyLabel = computed(() =>
  isPerccliMinimal.value ? policyDefaultLabel.value : props.writePolicy,
)

const cachePolicyLabel = computed(() => {
  if (isPerccliMinimal.value) {
    return t('raid.hw_create_wizard.compat.cache_controller_default')
  }
  return t('raid.hw_create_wizard.compat.cache_from_wizard', {
    read: props.readPolicy,
    write: props.writePolicy,
  })
})

const introText = computed(() =>
  isPerccliMinimal.value
    ? t('raid.hw_create_wizard.compat.intro_perccli')
    : t('raid.hw_create_wizard.compat.intro_storcli'),
)

const volumeNameFieldLabel = computed(() =>
  props.volumeNameOnCreate
    ? t('raid.hw_create_wizard.compat.volume_name')
    : t('raid.hw_create_wizard.compat.volume_name_post_create_label'),
)

const volumeNameFieldValue = computed(() => {
  if (!props.volumeName) return '—'
  if (props.volumeNameOnCreate) {
    return props.volumeName
  }
  return t('raid.hw_create_wizard.compat.volume_name_post_create_value', { name: props.volumeName })
})

const bulletPoints = computed(() => {
  if (isPerccliMinimal.value) {
    const points = [
      t('raid.hw_create_wizard.compat.point_minimal_syntax'),
      t('raid.hw_create_wizard.compat.point_cache_defaults'),
      t('raid.hw_create_wizard.compat.point_not_blocking'),
      t('raid.hw_create_wizard.compat.point_adjust_later'),
      t('raid.hw_create_wizard.compat.point_avoid_syntax_error'),
    ]
    if (props.volumeName && !props.volumeNameOnCreate) {
      points.push(t('raid.hw_create_wizard.compat.point_name_post_create'))
    }
    return points
  }
  return [
    t('raid.hw_create_wizard.compat.point_storcli_policies'),
    t('raid.hw_create_wizard.compat.point_not_blocking'),
  ]
})
</script>
