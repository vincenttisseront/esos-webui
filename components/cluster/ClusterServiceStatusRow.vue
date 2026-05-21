<template>
  <div class="flex items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-950 px-3 py-2">
    <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ label }}</span>

    <div class="flex items-center gap-2">
      <!-- Badge statut avec dot pulsant -->
      <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="running ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'"
      >
        <span
          class="h-1.5 w-1.5 rounded-full"
          :class="running ? 'bg-green-500 animate-pulse' : 'bg-gray-300'"
        />
        {{ running ? 'En cours' : 'Arrêté' }}
      </span>

      <!-- Bouton start/stop -->
      <UTooltip :text="running ? 'Arrêter le service' : 'Démarrer le service'">
        <UButton
          :icon="running ? 'i-heroicons-stop-circle' : 'i-heroicons-play-circle'"
          size="xs"
          :color="running ? 'red' : 'green'"
          variant="ghost"
          :loading="toggling"
          @click="toggle"
        />
      </UTooltip>

      <!-- Icône rc.conf enabled (cliquable si allowToggleEnabled) -->
      <UTooltip :text="enabledTooltip">
        <button
          v-if="allowToggleEnabled"
          class="rounded p-0.5 transition-colors hover:bg-gray-200"
          :disabled="togglingEnabled"
          @click="toggleEnabled"
        >
          <UIcon
            :name="togglingEnabled ? 'i-heroicons-arrow-path' : 'i-heroicons-power'"
            class="w-3.5 h-3.5"
            :class="[
              togglingEnabled ? 'animate-spin text-gray-400' : '',
              !togglingEnabled && enabled  ? 'text-blue-400' : '',
              !togglingEnabled && !enabled ? 'text-gray-300' : '',
            ]"
          />
        </button>
        <UIcon
          v-else
          name="i-heroicons-power"
          class="w-3.5 h-3.5"
          :class="enabled ? 'text-blue-400' : 'text-gray-300'"
        />
      </UTooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label:              string
  running:            boolean
  enabled:            boolean
  nodeId:             string
  service:            'corosync' | 'pacemaker' | 'drbd'
  allowToggleEnabled?: boolean
  enabledLabel?:      string  // libellé custom pour le tooltip (ex: "Mode standalone")
}>()

const emit          = defineEmits(['toggled'])
const toggling      = ref(false)
const togglingEnabled = ref(false)

const enabledTooltip = computed(() => {
  if (props.allowToggleEnabled) {
    const onLabel  = props.enabledLabel ?? 'Activé au démarrage'
    const offLabel = props.enabledLabel ? `${props.enabledLabel} désactivé` : 'Désactivé au démarrage'
    return props.enabled
      ? `${onLabel} — cliquer pour désactiver`
      : `${offLabel} — cliquer pour activer`
  }
  return props.enabled ? 'Activé au démarrage' : 'Désactivé au démarrage'
})

async function toggle() {
  const action = props.running ? 'stop' : 'start'
  const ok = await modalConfirm({
    title:   `${action === 'start' ? 'Démarrer' : 'Arrêter'} ${props.service}`,
    message: `Cette action affecte le nœud ${props.nodeId}. Continuer ?`,
    intent:  action === 'stop' ? 'danger' : 'neutral',
  })
  if (!ok) return
  toggling.value = true
  try {
    await $fetch('/api/cluster/service', {
      method: 'POST',
      body:   { nodeId: props.nodeId, service: props.service, action },
    })
    emit('toggled')
  } catch (err: any) {
    useAppToast().error(`Erreur sur ${props.service}`, err?.data?.message ?? 'Erreur inconnue')
  } finally {
    toggling.value = false
  }
}

async function toggleEnabled() {
  const action: 'enable' | 'disable' = props.enabled ? 'disable' : 'enable'
  const ok = await modalConfirm({
    title:   props.enabled ? `Désactiver ${props.service}` : `Activer ${props.service} en standalone`,
    message: props.enabled
      ? `Désactive rc.${props.service}_enable sur ${props.nodeId}. Si Pacemaker gère ce service, ne rien changer ici.`
      : `Active rc.${props.service}_enable=YES sur ${props.nodeId}. Le service sera géré en standalone, plus par Pacemaker.`,
    intent: 'danger',
  })
  if (!ok) return
  togglingEnabled.value = true
  try {
    await $fetch('/api/cluster/service', {
      method: 'POST',
      body:   { nodeId: props.nodeId, service: props.service, action },
    })
    emit('toggled')
  } catch (err: any) {
    useAppToast().error(`Erreur enable/disable ${props.service}`, err?.data?.message ?? 'Erreur inconnue')
  } finally {
    togglingEnabled.value = false
  }
}
</script>
