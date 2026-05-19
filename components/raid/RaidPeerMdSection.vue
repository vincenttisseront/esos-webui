<template>
  <details
    v-if="peers.length"
    id="raid-software-peer"
    class="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20"
  >
    <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-purple-900 dark:text-purple-200 select-none list-none flex items-center justify-between gap-2">
      <span>{{ t('raid.peer_section.summary', { count: peers.length }) }}</span>
      <span class="text-xs font-normal text-purple-700 dark:text-purple-400">{{ t('raid.software.help.toggle_show') }}</span>
    </summary>
    <div class="px-3 pb-3 pt-1 space-y-3 border-t border-purple-200 dark:border-purple-800">
      <UAlert
        v-for="peer in peers"
        :key="peer.nodeSanId"
        :title="t('raid.md_detection.peer_banner_title', { label: peer.nodeLabel })"
        color="amber"
        icon="i-heroicons-exclamation-triangle"
        variant="soft"
      >
        <template #description>
          <ul class="list-disc pl-4 text-sm space-y-0.5 mt-1">
            <li v-for="item in peer.items" :key="item.path + item.kind">
              {{ item.summary }}
            </li>
          </ul>
          <UButton
            class="mt-2"
            size="xs"
            color="amber"
            variant="soft"
            :to="peerRaidLink(peer.nodeSanId)"
          >
            {{ t('raid.md_detection.view_peer_raid', { label: peer.nodeLabel }) }}
          </UButton>
        </template>
      </UAlert>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { MdDetectionSummary } from '~/types/raid'

const { t } = useEsosI18n()

defineProps<{
  peers: MdDetectionSummary[]
  peerRaidLink: (sanId: string) => string
}>()
</script>
