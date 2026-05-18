<script setup lang="ts">
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'

const { isPending } = useNetworkPendingRestart()

interface SanRow {
  id: string
  label: string
  description: string | null
  host: string
  port: number
  username: string
  driver: string
  status: string
  authType: 'key' | 'password'
  readOnly: boolean
  clusterEnabled: boolean
  clusterRole: string | null
  clusterId: string | null
}

type SSHStatus = 'connecting' | 'connected' | 'reconnecting' | 'error'

const props = defineProps<{
  rows: SanRow[]
  liveStatuses: Record<string, SSHStatus>
  isViewer: boolean
  testing: Record<string, boolean>
  toggling: Record<string, boolean>
}>()

const emit = defineEmits<{
  (e: 'test', id: string): void
  (e: 'delete', id: string): void
  (e: 'toggleReadOnly', san: SanRow): void
}>()

function statusColor(status: string) {
  switch (status) {
    case 'active': return 'green'
    case 'inactive': return 'gray'
    case 'maintenance': return 'yellow'
    default: return 'gray'
  }
}

function liveStatusLabel(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'Connecté'
    case 'connecting': return 'Connexion…'
    case 'reconnecting': return 'Reconnexion…'
    case 'error': return 'Erreur'
    default: return 'Non initialisé'
  }
}

function liveStatusDot(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'bg-green-400'
    case 'connecting': return 'bg-yellow-400 animate-pulse'
    case 'reconnecting': return 'bg-orange-400 animate-pulse'
    case 'error': return 'bg-red-400'
    default: return 'bg-gray-300'
  }
}

function liveStatusTextColor(s: SSHStatus | undefined): string {
  switch (s) {
    case 'connected': return 'text-green-600'
    case 'connecting': return 'text-yellow-600'
    case 'reconnecting': return 'text-orange-600'
    case 'error': return 'text-red-600'
    default: return 'text-gray-400'
  }
}
</script>

<template>
  <div v-if="!rows.length" class="text-gray-400 py-6 text-center text-sm">Aucun SAN dans ce groupe.</div>
  <table v-else class="w-full text-sm">
    <thead class="text-left text-xs text-gray-400 uppercase tracking-wider border-b">
      <tr>
        <th class="py-2 pr-4">Label</th>
        <th class="pr-4">Host</th>
        <th class="pr-4">Utilisateur</th>
        <th class="pr-4">Auth</th>
        <th class="pr-4">DB</th>
        <th class="pr-4">Rôle</th>
        <th class="pr-4">Connexion live</th>
        <th class="pr-4">Édition web</th>
        <th class="text-right">Actions</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-100">
      <tr
        v-for="san in rows"
        :key="san.id"
        class="hover:bg-gray-50 transition-colors"
      >
        <td class="py-3 pr-4">
          <div class="font-medium text-gray-900 flex items-center gap-1.5">
            {{ san.label }}
            <UTooltip
              v-if="isPending(san.id).value"
              text="Configuration réseau enregistrée mais non appliquée — redémarrage requis"
            >
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-orange-500 shrink-0" />
            </UTooltip>
          </div>
          <div v-if="san.description" class="text-xs text-gray-400">{{ san.description }}</div>
        </td>
        <td class="pr-4 font-mono text-xs text-gray-600">{{ san.host }}:{{ san.port }}</td>
        <td class="pr-4 text-gray-600">{{ san.username }}</td>
        <td class="pr-4">
          <UBadge
            :color="san.authType === 'key' ? 'blue' : 'orange'"
            variant="subtle"
            size="xs"
          >
            <UIcon :name="san.authType === 'key' ? 'i-heroicons-key' : 'i-heroicons-lock-closed'" class="mr-1" />
            {{ san.authType === 'key' ? 'Clé SSH' : 'Mot de passe' }}
          </UBadge>
        </td>
        <td class="pr-4">
          <UBadge :color="statusColor(san.status)" variant="subtle" size="xs">
            {{ san.status }}
          </UBadge>
        </td>
        <td class="pr-4">
          <UBadge
            v-if="san.clusterRole"
            :color="san.clusterRole === 'primary' ? 'blue' : 'indigo'"
            variant="subtle"
            size="xs"
          >
            {{ san.clusterRole === 'primary' ? 'Primaire' : 'Secondaire' }}
          </UBadge>
          <span v-else class="text-xs text-gray-300">—</span>
        </td>
        <td class="pr-4">
          <div class="flex items-center gap-1.5">
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :class="liveStatusDot(liveStatuses[san.id])"
            />
            <span class="text-xs" :class="liveStatusTextColor(liveStatuses[san.id])">
              {{ liveStatusLabel(liveStatuses[san.id]) }}
            </span>
            <UIcon
              v-if="liveStatuses[san.id] === 'connecting' || liveStatuses[san.id] === 'reconnecting'"
              name="i-heroicons-arrow-path"
              class="w-3 h-3 animate-spin text-yellow-500"
            />
          </div>
        </td>
        <td class="pr-4">
          <div class="flex items-center gap-1.5">
            <span
              v-if="!isViewer"
              class="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent cursor-pointer"
              :class="san.readOnly ? 'bg-gray-200' : 'bg-primary-500'"
              @click="emit('toggleReadOnly', san)"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform"
                :class="san.readOnly ? 'translate-x-0' : 'translate-x-4'"
              />
            </span>
            <span class="text-xs" :class="san.readOnly ? 'text-gray-400' : 'text-primary-600 font-medium'">
              {{ san.readOnly ? 'Lecture seule' : 'Éditable' }}
            </span>
          </div>
        </td>
        <td class="text-right space-x-1">
          <UButton
            v-if="!isViewer"
            size="xs"
            variant="ghost"
            icon="i-heroicons-bolt"
            :loading="testing[san.id]"
            @click="emit('test', san.id)"
          >
            Test
          </UButton>
          <UTooltip v-if="!isViewer" text="Configuration système">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-heroicons-wrench-screwdriver"
              :to="`/admin/sans/${san.id}/system-config`"
            />
          </UTooltip>
          <UTooltip v-if="!isViewer" text="Gestion RAID">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-heroicons-circle-stack"
              :to="`/admin/sans/${san.id}/raid`"
            />
          </UTooltip>
          <UTooltip v-if="!isViewer" text="Agent de performance">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-heroicons-bolt"
              :to="`/admin/sans/${san.id}/performance`"
            />
          </UTooltip>
          <UButton
            v-if="!isViewer"
            size="xs"
            variant="ghost"
            color="red"
            icon="i-heroicons-trash"
            @click="emit('delete', san.id)"
          />
          <span v-if="isViewer" class="text-xs text-gray-400 italic">Lecture seule</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
