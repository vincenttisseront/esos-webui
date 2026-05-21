<template>
  <div class="space-y-3">
    <p class="text-xs font-semibold text-amber-700 uppercase tracking-wide">
      {{ t('raid.create_md.peer_cleanup.section_title') }}
    </p>
    <p class="text-xs text-amber-800 dark:text-amber-300">
      {{ t('raid.create_md.peer_cleanup.section_description') }}
    </p>

    <div
      v-for="group in groups"
      :key="group.sanId"
      class="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40/80 p-4 space-y-3"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ group.label }}</p>
          <p class="text-xs font-mono text-gray-500 dark:text-gray-400">{{ group.sanId }}</p>
        </div>
        <UBadge
          :label="group.sshReady ? t('raid.create_md.peer_cleanup.ssh_ready') : t('raid.create_md.peer_cleanup.ssh_unavailable')"
          :color="group.sshReady ? 'green' : 'red'"
          size="xs"
          variant="soft"
        />
      </div>

      <div>
        <p class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1">
          {{ t('raid.create_md.peer_cleanup.affected_partitions') }}
        </p>
        <ul class="list-disc pl-5 text-sm font-mono text-gray-800 dark:text-gray-200 space-y-0.5">
          <li v-for="member in group.members" :key="member">{{ member }}</li>
        </ul>
      </div>

      <UButton
        v-if="expandedPeerSanId !== group.sanId"
        size="sm"
        color="amber"
        variant="solid"
        :disabled="!group.sshReady || disabled"
        @click="openCleanup(group)"
      >
        {{ t('raid.create_md.peer_cleanup.action', { label: group.label }) }}
      </UButton>

      <div
        v-else
        class="space-y-3 rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-gray-900 p-3"
      >
        <p class="text-xs text-amber-900">
          {{ t('raid.create_md.peer_cleanup.risk_single_node', { label: group.label }) }}
        </p>
        <p class="text-xs text-gray-600 dark:text-gray-400">
          {{ t('raid.create_md.peer_cleanup.no_sync') }}
        </p>

        <div class="flex flex-wrap gap-2">
          <UButton
            size="xs"
            :color="cleanupMode[group.sanId] === 'basic' ? 'amber' : 'gray'"
            :variant="cleanupMode[group.sanId] === 'basic' ? 'solid' : 'outline'"
            @click="cleanupMode[group.sanId] = 'basic'"
          >
            {{ t('raid.create_md.peer_cleanup.mode_basic') }}
          </UButton>
          <UButton
            size="xs"
            :color="cleanupMode[group.sanId] === 'advanced' ? 'amber' : 'gray'"
            :variant="cleanupMode[group.sanId] === 'advanced' ? 'solid' : 'outline'"
            @click="cleanupMode[group.sanId] = 'advanced'"
          >
            {{ t('raid.create_md.peer_cleanup.mode_advanced') }}
          </UButton>
        </div>

        <div class="space-y-2">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            {{ t('raid.cluster_md.confirm_phrase_hint') }}
            <code class="text-amber-800 dark:text-amber-300 bg-amber-100 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded font-mono text-xs">{{ confirmationPhrase(group.label) }}</code>
          </p>
          <UInput
            v-model="inputPhrase[group.sanId]"
            :placeholder="confirmationPhrase(group.label)"
            :disabled="executingSanId === group.sanId"
            class="font-mono"
            @paste.prevent
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            size="sm"
            color="gray"
            variant="outline"
            :disabled="executingSanId === group.sanId"
            @click="closeCleanup"
          >
            {{ t('common.actions.cancel') }}
          </UButton>
          <UButton
            size="sm"
            color="red"
            :loading="executingSanId === group.sanId"
            :disabled="!canExecute(group)"
            @click="executeCleanup(group)"
          >
            {{ t('raid.create_md.peer_cleanup.confirm_execute', { label: group.label }) }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClusterStoragePreflightResult } from '~/types/raid'
import {
  buildPeerLocalRecoveryPayload,
  expectedPeerCleanupConfirmation,
  groupPeerSuperblockBlockers,
  type PeerSuperblockCleanupGroup,
} from '~/utils/create-md-peer-cleanup'

const props = defineProps<{
  preflight: ClusterStoragePreflightResult
  primarySanId: string
  sourceDevices: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  cleaned: []
}>()

const { t } = useEsosI18n()
const raid = useRaidStore()
const toast = useAppToast()

const expandedPeerSanId = ref<string | null>(null)
const executingSanId = ref<string | null>(null)
const inputPhrase = reactive<Record<string, string>>({})
const cleanupMode = reactive<Record<string, 'basic' | 'advanced'>>({})

const groups = computed(() =>
  groupPeerSuperblockBlockers(props.preflight, props.primarySanId, props.sourceDevices),
)

function confirmationPhrase(label: string): string {
  return expectedPeerCleanupConfirmation(label)
}

function openCleanup(group: PeerSuperblockCleanupGroup) {
  expandedPeerSanId.value = group.sanId
  if (!cleanupMode[group.sanId]) cleanupMode[group.sanId] = 'basic'
  inputPhrase[group.sanId] = ''
}

function closeCleanup() {
  expandedPeerSanId.value = null
}

function canExecute(group: PeerSuperblockCleanupGroup): boolean {
  if (!group.sshReady || props.disabled) return false
  return inputPhrase[group.sanId] === confirmationPhrase(group.label)
}

async function executeCleanup(group: PeerSuperblockCleanupGroup) {
  if (!canExecute(group)) return
  executingSanId.value = group.sanId
  const confirmation = inputPhrase[group.sanId]
  const payload = buildPeerLocalRecoveryPayload({
    peerSanId: group.sanId,
    members: group.members,
    confirmation,
  })
  try {
    if (cleanupMode[group.sanId] === 'advanced') {
      await raid.wipeMdSignaturesOnSan(group.sanId, {
        members: payload.members,
        confirmation: payload.confirmation,
        mode: 'advanced',
        localRecovery: payload.localRecovery,
      })
    } else {
      await raid.zeroMdSuperblocksOnSan(group.sanId, {
        members: payload.members,
        confirmation: payload.confirmation,
        mode: 'basic',
        localRecovery: payload.localRecovery,
      })
    }
    toast.success(t('raid.create_md.peer_cleanup.toast_success', { label: group.label }))
    closeCleanup()
    emit('cleaned')
  } catch (err: any) {
    toast.error(
      t('raid.create_md.peer_cleanup.toast_failed', { label: group.label }),
      err?.data?.statusMessage ?? err.message,
    )
  } finally {
    executingSanId.value = null
  }
}
</script>
