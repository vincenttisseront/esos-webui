<template>
  <AdminSection title="Informations Système" icon="i-heroicons-information-circle">
    <dl class="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">

      <div>
        <dt class="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Version</dt>
        <dd class="font-mono text-gray-800">{{ info.app.version }}</dd>
      </div>

      <div>
        <dt class="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Uptime serveur</dt>
        <dd class="text-gray-800">{{ formatUptime(info.app.nodeUptime) }}</dd>
      </div>

      <div>
        <dt class="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Statut SSH</dt>
        <dd>
          <UBadge
            :color="info.ssh.status === 'connected' ? 'green' : 'red'"
            size="xs"
          >{{ info.ssh.status }}</UBadge>
          <span class="ml-2 font-mono text-xs text-gray-600">
            {{ info.ssh.user }}@{{ info.ssh.host }}:{{ info.ssh.port }}
          </span>
        </dd>
      </div>

      <div>
        <dt class="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Métriques</dt>
        <dd class="text-gray-800">
          {{ info.metrics.totalSamples.toLocaleString('fr-FR') }} samples
          <span v-if="info.metrics.oldestSampleAt" class="text-gray-400 text-xs">
            depuis {{ formatDate(info.metrics.oldestSampleAt) }}
          </span>
        </dd>
      </div>

    </dl>
  </AdminSection>
</template>

<script setup lang="ts">
defineProps<{ info: any }>()

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}j ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
</script>
