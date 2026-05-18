<template>
  <BaseModal
    :title="t('raid.stopped_md.diagnostics_title')"
    icon="i-heroicons-exclamation-triangle"
    intent="warning"
    size="md"
    @cancel="$emit('cancel')"
  >
    <div class="space-y-4">
      <p
        v-for="(result, idx) in results"
        :key="result.partition + String(idx)"
        class="text-sm text-gray-700 dark:text-gray-300"
      >
        {{ result.partition }}
        <UBadge
          :label="result.diagnostics?.verifiedRemoved ? 'OK' : 'Détecté'"
          :color="result.diagnostics?.verifiedRemoved ? 'green' : 'amber'"
          variant="soft"
          size="xs"
          class="ml-2"
        />
      </p>

      <div
        v-for="(result, idx) in resultsWithDiagnostics"
        :key="'diag-' + result.partition + String(idx)"
        class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      >
        <div class="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <p class="text-sm font-medium font-mono text-gray-800 dark:text-gray-200">{{ result.partition }}</p>
          <p v-if="result.diagnostics?.remainingSignatureTypes?.length" class="text-xs text-amber-700 dark:text-amber-400 mt-1">
            {{ t('raid.stopped_md.diagnostics_remaining', { types: result.diagnostics.remainingSignatureTypes.join(', ') }) }}
          </p>
        </div>

        <table class="w-full text-xs">
          <thead>
            <tr class="text-left text-gray-500 border-b border-gray-100 dark:border-gray-700">
              <th class="px-3 py-2 font-medium">{{ t('raid.stopped_md.diagnostics_check_label') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('raid.stopped_md.diagnostics_detected_label') }}</th>
              <th class="px-3 py-2 font-medium">{{ t('raid.stopped_md.diagnostics_detail_label') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            <tr>
              <td class="px-3 py-2">{{ t('raid.stopped_md.diagnostics_check_examine') }}</td>
              <td class="px-3 py-2">
                <UBadge
                  :label="result.diagnostics?.detectionSources.mdadmExamine ? 'oui' : 'non'"
                  :color="result.diagnostics?.detectionSources.mdadmExamine ? 'amber' : 'green'"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2 text-gray-500 font-mono truncate max-w-[12rem]" :title="result.diagnostics?.mdadmExamine.stdout">
                {{ examineSummary(result) }}
              </td>
            </tr>
            <tr>
              <td class="px-3 py-2">{{ t('raid.stopped_md.diagnostics_check_wipefs') }}</td>
              <td class="px-3 py-2">
                <UBadge
                  :label="result.diagnostics?.detectionSources.wipefs ? 'oui' : 'non'"
                  :color="result.diagnostics?.detectionSources.wipefs ? 'amber' : 'green'"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2 text-gray-500">
                {{ result.diagnostics?.wipefsProbe.signatures.join(', ') || '—' }}
              </td>
            </tr>
            <tr>
              <td class="px-3 py-2">{{ t('raid.stopped_md.diagnostics_check_blkid') }}</td>
              <td class="px-3 py-2">
                <UBadge
                  :label="result.diagnostics?.detectionSources.blkid ? 'oui' : 'non'"
                  :color="result.diagnostics?.detectionSources.blkid ? 'amber' : 'green'"
                  variant="soft"
                  size="xs"
                />
              </td>
              <td class="px-3 py-2 text-gray-500">
                {{ result.diagnostics?.blkidProbe.types.join(', ') || '—' }}
              </td>
            </tr>
          </tbody>
        </table>

        <details class="px-3 py-2 text-xs border-t border-gray-100 dark:border-gray-700">
          <summary class="cursor-pointer text-gray-600 dark:text-gray-400 select-none">
            mdadm --examine (sortie)
          </summary>
          <pre class="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded overflow-x-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ result.diagnostics?.mdadmExamine.stdout || '(vide)' }}</pre>
        </details>

        <p
          v-if="result.diagnostics?.recommendedAction === 'advanced_wipe_signatures'"
          class="px-3 py-2 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-100 dark:border-amber-900"
        >
          {{ t('raid.stopped_md.diagnostics_recommend_wipe') }}
        </p>
        <p
          v-else-if="result.diagnostics?.recommendedAction === 'manual_investigation'"
          class="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700"
        >
          {{ t('raid.stopped_md.diagnostics_recommend_manual') }}
        </p>
      </div>

      <details v-if="results[0]?.diagnostics?.zeroSuperblock" class="text-xs">
        <summary class="cursor-pointer text-gray-600 select-none">mdadm --zero-superblock</summary>
        <pre class="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded overflow-x-auto whitespace-pre-wrap">{{ zeroStepPreview }}</pre>
      </details>
    </div>

    <template #actions>
      <UButton color="gray" variant="outline" size="sm" @click="$emit('cancel')">
        {{ t('raid.stopped_md.diagnostics_close') }}
      </UButton>
      <UButton
        v-if="canAdvancedWipe"
        color="amber"
        size="sm"
        icon="i-heroicons-trash"
        @click="$emit('confirm', 'wipe')"
      >
        {{ t('raid.stopped_md.advanced_cleanup') }}
      </UButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import type { ZeroMdSuperblockPartitionResult } from '~/types/raid'

const props = defineProps<{
  results: ZeroMdSuperblockPartitionResult[]
}>()

defineEmits<{
  confirm: [action: 'wipe']
  cancel: []
}>()

const { t } = useEsosI18n()

const resultsWithDiagnostics = computed(() =>
  props.results.filter(r => r.diagnostics),
)

const canAdvancedWipe = computed(() =>
  props.results.some(r => r.diagnostics?.recommendedAction === 'advanced_wipe_signatures'),
)

const zeroStepPreview = computed(() => {
  const z = props.results[0]?.diagnostics?.zeroSuperblock
  if (!z) return ''
  return [
    `command: ${z.command}`,
    `exit: ${z.exitCode}`,
    z.stdout,
    z.stderr,
  ].filter(Boolean).join('\n')
})

function examineSummary(result: ZeroMdSuperblockPartitionResult): string {
  const d = result.diagnostics
  if (!d) return '—'
  if (d.mdadmExamine.detected) return 'superblock'
  if (/No md superblock/i.test(d.mdadmExamine.stdout)) return 'aucun'
  return '—'
}
</script>
