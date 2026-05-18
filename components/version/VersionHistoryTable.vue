<template>
  <div class="rounded-lg border border-gray-200 bg-white overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
      <h3 class="text-sm font-semibold text-gray-700">Historique des versions ESOS</h3>
      <span class="text-xs text-gray-400">{{ tags.length }} versions disponibles</span>
    </div>

    <table class="w-full text-sm">
      <thead class="bg-gray-50 text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
        <tr>
          <th class="px-4 py-2">Version</th>
          <th class="px-4 py-2">SHA</th>
          <th class="px-4 py-2">Publiée</th>
          <th class="px-4 py-2">Branche</th>
          <th class="px-4 py-2 text-right">Liens</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr v-for="(tag, i) in tags" :key="tag.name" class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-2.5">
            <div class="flex items-center gap-2">
              <span class="font-mono font-semibold text-gray-800">{{ tag.name }}</span>
              <UBadge v-if="i === 0" color="green" size="xs" variant="subtle">latest</UBadge>
              <UBadge
                v-if="installedVersion && tag.name === installedVersion"
                color="blue"
                size="xs"
                variant="subtle"
              >
                installé
              </UBadge>
            </div>
          </td>
          <td class="px-4 py-2.5">
            <a
              :href="`https://github.com/quantum/esos/commit/${tag.sha}`"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-blue-600 hover:underline text-xs"
            >{{ tag.sha }}</a>
          </td>
          <td class="px-4 py-2.5 text-gray-400 text-xs">
            {{ tag.publishedAt ? formatDate(tag.publishedAt) : '—' }}
          </td>
          <td class="px-4 py-2.5">
            <span class="font-mono text-xs text-gray-500">{{ tag.name.split('.')[0] }}.x.x</span>
          </td>
          <td class="px-4 py-2.5 text-right">
            <div class="flex items-center justify-end gap-1">
              <UTooltip text="Télécharger ZIP">
                <a
                  :href="tag.zipUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1 text-gray-400 hover:text-blue-500 rounded hover:bg-gray-100 transition-colors"
                >
                  <UIcon name="i-heroicons-arrow-down-tray" class="w-4 h-4" />
                </a>
              </UTooltip>
              <UTooltip text="Voir sur GitHub">
                <a
                  :href="`https://github.com/quantum/esos/releases/tag/${tag.name}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
                >
                  <UIcon name="i-heroicons-code-bracket-square" class="w-4 h-4" />
                </a>
              </UTooltip>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { GitHubTag } from '~/server/utils/types'

defineProps<{ tags: GitHubTag[]; installedVersion?: string }>()

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}
</script>
