<template>
  <div
    v-if="totalCount > 0"
    id="raid-attention-summary"
    class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5 space-y-2"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
        {{ t('raid.attention.title') }}
      </p>
      <span v-if="hasOverflow" class="text-xs text-amber-700 dark:text-amber-400">
        {{ t('raid.attention.show_all', { count: totalCount }) }}
      </span>
    </div>

    <div v-if="compactLocal.length" class="space-y-1">
      <p class="text-xs font-medium text-amber-800 dark:text-amber-300">
        {{ t('raid.attention.local_group', { count: local.length }) }}
      </p>
      <ul class="space-y-1.5">
        <li
          v-for="item in compactLocal"
          :key="`${item.path}:${item.kind}`"
          class="flex flex-wrap items-start justify-between gap-2 text-xs"
        >
          <div class="min-w-0 flex-1">
            <span class="font-mono">{{ item.path }}</span>
            <span class="text-gray-600 dark:text-gray-400"> — {{ truncate(item.summary) }}</span>
          </div>
          <UButton size="xs" color="gray" variant="soft" @click="$emit('navigate', item)">
            {{ t('raid.md_detection.view_in_raid_ui') }}
          </UButton>
        </li>
      </ul>
    </div>

    <div v-if="compactPeer.length" class="space-y-1">
      <p class="text-xs font-medium text-amber-800 dark:text-amber-300">
        {{ t('raid.attention.peer_group', { count: peerGroups.length }) }}
      </p>
      <ul class="space-y-1.5">
        <li
          v-for="group in compactPeer"
          :key="group.nodeSanId"
          class="flex flex-wrap items-start justify-between gap-2 text-xs"
        >
          <div class="min-w-0 flex-1">
            <span class="font-medium">{{ group.nodeLabel }}</span>
            <span class="text-gray-600 dark:text-gray-400">
              — {{ t('raid.attention.peer_items', { count: group.items.length }) }}
            </span>
            <span v-if="group.topSummary" class="text-gray-500"> · {{ truncate(group.topSummary) }}</span>
          </div>
          <UButton
            size="xs"
            color="amber"
            variant="soft"
            :to="peerRaidLink(group.nodeSanId)"
          >
            {{ t('raid.md_detection.view_peer_raid', { label: group.nodeLabel }) }}
          </UButton>
        </li>
      </ul>
    </div>

    <details v-if="hasOverflow" class="text-xs mt-1">
      <summary class="cursor-pointer text-amber-800 dark:text-amber-300 py-1">
        {{ t('raid.attention.show_all_details') }}
      </summary>
      <RaidMdBlockersPanel
        class="mt-2"
        embedded
        :items="items"
        :current-san-id="currentSanId"
        :peer-raid-link="peerRaidLink"
        @navigate="$emit('navigate', $event)"
      />
    </details>
  </div>
</template>

<script setup lang="ts">
import type { MdDetectionItem } from '~/types/raid'
import { partitionAttentionItems, truncateSummary } from '~/utils/raid-md-detection'

const props = defineProps<{
  items: MdDetectionItem[]
  currentSanId: string
  peerRaidLink: (sanId: string) => string
  maxLocal?: number
  maxPeer?: number
}>()

defineEmits<{
  navigate: [item: MdDetectionItem]
}>()

const { t } = useEsosI18n()

const maxLocal = computed(() => props.maxLocal ?? 3)
const maxPeer = computed(() => props.maxPeer ?? 2)

const partitioned = computed(() =>
  partitionAttentionItems(props.items, props.currentSanId),
)
const local = computed(() => partitioned.value.local)
const peer = computed(() => partitioned.value.peer)

const totalCount = computed(() => local.value.length + peer.value.length)

const compactLocal = computed(() => local.value.slice(0, maxLocal.value))

interface PeerGroup {
  nodeSanId: string
  nodeLabel: string
  items: MdDetectionItem[]
  topSummary?: string
}

const peerGroups = computed((): PeerGroup[] => {
  const map = new Map<string, PeerGroup>()
  for (const item of peer.value) {
    const g = map.get(item.nodeSanId) ?? {
      nodeSanId: item.nodeSanId,
      nodeLabel: item.nodeLabel,
      items: [],
    }
    g.items.push(item)
    map.set(item.nodeSanId, g)
  }
  return [...map.values()].map((g) => ({
    ...g,
    topSummary: g.items[0]?.summary,
  }))
})

const compactPeer = computed(() => peerGroups.value.slice(0, maxPeer.value))

const hasOverflow = computed(() =>
  local.value.length > maxLocal.value || peerGroups.value.length > maxPeer.value,
)

function truncate(text: string) {
  return truncateSummary(text, 60)
}
</script>
