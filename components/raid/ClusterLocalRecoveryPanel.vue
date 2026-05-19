<template>
  <motion.div
    class="space-y-4 rounded-lg border-2 border-red-300 dark:border-red-800 bg-red-50/80 dark:bg-red-950/30 p-4"
    :initial="{ opacity: 0, y: 8 }"
    :animate="{ opacity: 1, y: 0 }"
  >
    <div class="space-y-1">
      <p class="text-sm font-semibold text-red-900 dark:text-red-200">
        {{ t('raid.cluster_md.local_recovery.title') }}
      </p>
      <p class="text-xs text-red-800 dark:text-red-300">
        {{ t('raid.cluster_md.local_recovery.description') }}
      </p>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        {{ t('raid.cluster_md.local_recovery.affected_node') }}
      </p>
      <div class="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm">
        <span class="font-semibold">{{ offered.primaryLabel }}</span>
        <span class="font-mono text-xs text-gray-500 ml-2">({{ offered.primarySanId }})</span>
        <p v-if="members.length" class="text-xs text-gray-500 mt-1 font-mono">
          {{ members.join(', ') }}
        </p>
      </div>
    </div>

    <div v-if="offered.skippedPeers.length" class="space-y-2">
      <p class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        {{ t('raid.cluster_md.local_recovery.skipped_peers_title') }}
      </p>
      <div
        v-for="peer in offered.skippedPeers"
        :key="peer.sanId"
        class="text-xs rounded border border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800/50"
      >
        <span class="font-medium">{{ peer.label }}</span>
        <ul class="list-disc pl-4 mt-1 text-gray-500">
          <li v-for="(reason, idx) in peer.reasons" :key="idx">{{ reason }}</li>
        </ul>
      </div>
    </div>

    <div v-if="confirmationPhrase" class="space-y-2">
      <p class="text-sm text-gray-700 dark:text-gray-300">
        {{ t('raid.cluster_md.confirm_phrase_hint') }}
        <code class="text-red-800 bg-red-100 border border-red-200 px-1.5 py-0.5 rounded font-mono text-xs">{{ confirmationPhrase }}</code>
      </p>
      <UInput
        v-model="inputPhrase"
        :placeholder="confirmationPhrase"
        :disabled="disabled"
        class="font-mono"
        @paste.prevent
      />
    </div>
  </motion.div>
</template>

<script setup lang="ts">
import type { MdLocalRecoveryOffered } from '~/types/raid'

defineProps<{
  offered: MdLocalRecoveryOffered
  members: string[]
  confirmationPhrase: string
  disabled?: boolean
}>()

const inputPhrase = defineModel<string>('inputPhrase', { default: '' })

const { t } = useEsosI18n()
</script>
