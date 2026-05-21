<template>
  <div class="flex flex-wrap items-center gap-2">
    <template v-if="showSplit">
      <UBadge :color="localColor" variant="soft" size="sm">
        {{ t('raid.page_health.local') }}: {{ localLabel }}
      </UBadge>
      <UBadge :color="clusterColor" variant="solid" size="sm">
        {{ t('raid.page_health.cluster') }}: {{ clusterLabel }}
      </UBadge>
    </template>
    <RaidHealthBadge v-else :health="pageHealth" />
  </div>
</template>

<script setup lang="ts">
import type { RaidHealth } from '~/types/raid'

const props = defineProps<{
  pageHealth: RaidHealth
  localHealth: RaidHealth
  clusterHealth: RaidHealth
  isClustered: boolean
}>()

const { t } = useEsosI18n()

const showSplit = computed(() =>
  props.isClustered
  && (props.localHealth !== props.clusterHealth || props.pageHealth !== props.localHealth),
)

function healthColor(h: RaidHealth) {
  return ({
    ok: 'green',
    warning: 'amber',
    critical: 'red',
    rebuilding: 'blue',
    unknown: 'gray',
  } as const)[h] ?? 'gray'
}

function healthLabel(h: RaidHealth) {
  return ({
    ok: 'OK',
    warning: t('raid.page_health.warning'),
    critical: t('raid.page_health.critical'),
    rebuilding: t('raid.page_health.rebuilding'),
    unknown: t('raid.page_health.unknown'),
  })[h] ?? h
}

const localColor = computed(() => healthColor(props.localHealth))
const clusterColor = computed(() => healthColor(props.clusterHealth))
const localLabel = computed(() => healthLabel(props.localHealth))
const clusterLabel = computed(() => healthLabel(props.clusterHealth))
</script>
