<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-globe-alt" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">Configuration réseau</span>
      </div>
    </template>

    <div class="space-y-6">
      <!-- Warning banner -->
      <UAlert
        color="amber"
        variant="subtle"
        icon="i-heroicons-exclamation-triangle"
        title="Attention"
        description="Modifier la configuration réseau peut interrompre la connexion SSH. Cliquez sur « Redémarrer réseau » uniquement lorsque vous êtes prêt."
      />

      <!-- Pending restart banner -->
      <UAlert
        v-if="pendingSave"
        color="orange"
        variant="solid"
        icon="i-heroicons-arrow-path"
        title="Configuration enregistrée — redémarrage réseau requis"
        description="Les modifications ont été écrites sur le SAN mais ne sont pas encore actives. Cliquez sur « Redémarrer réseau » pour les appliquer."
      />

      <!-- Gateway / DNS / Search domain -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UFormField label="Passerelle par défaut">
          <UInput v-model="form.gateway" placeholder="192.168.1.1" :disabled="isDisabled" />
        </UFormField>

        <UFormField label="DNS (séparés par des virgules)">
          <UInput v-model="nameserversStr" placeholder="8.8.8.8, 1.1.1.1" :disabled="isDisabled" />
        </UFormField>

        <UFormField label="Domaine de recherche">
          <UInput v-model="form.searchDomain" placeholder="example.com" :disabled="isDisabled" />
        </UFormField>
      </div>

      <!-- Interface cards -->
      <div
        v-for="iface in form.interfaces"
        :key="iface.index"
        class="border border-gray-200 rounded-lg p-4 space-y-3"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="size-2 rounded-full"
              :class="iface.state === 'up' ? 'bg-green-500' : 'bg-gray-300'"
            />
            <span class="font-mono font-semibold text-gray-800">{{ iface.ifname }}</span>
            <span v-if="iface.currentIp" class="text-xs text-gray-500 font-mono">({{ iface.currentIp }})</span>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              :name="`dhcp-${iface.index}`"
              :value="true"
              v-model="iface.useDHCP"
              :disabled="isDisabled"
            />
            DHCP
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              :name="`dhcp-${iface.index}`"
              :value="false"
              v-model="iface.useDHCP"
              :disabled="isDisabled"
            />
            Statique
          </label>
        </div>

        <div v-if="!iface.useDHCP" class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <UFormField label="Adresse IP">
            <UInput v-model="iface.ipAddress" placeholder="192.168.1.10" :disabled="isDisabled" />
          </UFormField>
          <UFormField label="Masque">
            <UInput v-model="iface.netmask" placeholder="255.255.255.0" :disabled="isDisabled" />
          </UFormField>
          <UFormField label="Broadcast">
            <UInput v-model="iface.broadcast" placeholder="192.168.1.255" :disabled="isDisabled" />
          </UFormField>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="MTU">
            <UInput
              v-model.number="iface.mtu"
              type="number"
              placeholder="1500"
              :disabled="isDisabled"
            />
          </UFormField>
          <UFormField v-if="iface.useDHCP" label="Timeout DHCP (s)">
            <UInput
              v-model.number="iface.dhcpTimeout"
              type="number"
              placeholder="15"
              :disabled="isDisabled"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between">
        <UButton
          label="Redémarrer réseau"
          icon="i-heroicons-arrow-path"
          color="amber"
          variant="outline"
          :loading="restarting"
          :disabled="props.disabled || saving || restarting"
          @click="restartNetwork"
        />
        <UButton
          label="Enregistrer"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { NetworkGeneralConfig, NetworkInterfaceConfig } from '~/server/utils/types'
import { useAppToast } from '~/composables/useAppToast'
import { useNetworkPendingRestart } from '~/composables/useNetworkPendingRestart'

const props = defineProps<{
  sanId:     string
  sanLabel?: string
  config:    NetworkGeneralConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: []
  restarted: []
}>()

const toast = useAppToast()
const { markPending, clearPending, isPending } = useNetworkPendingRestart()
const pendingSave = isPending(props.sanId)

const form = reactive<NetworkGeneralConfig>(JSON.parse(JSON.stringify(props.config)))

const nameserversStr = computed({
  get: () => form.nameservers.join(', '),
  set: (v: string) => {
    form.nameservers = v.split(',').map(s => s.trim()).filter(Boolean)
  },
})

const saving      = ref(false)
const restarting  = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/network`, {
      method: 'PATCH',
      body: { ...form },
    })
    markPending(props.sanId, props.sanLabel ?? props.sanId)
    toast.success('Configuration réseau enregistrée', 'Cliquez sur « Redémarrer réseau » pour appliquer.')
    // Ne pas émettre saved ici — le rechargement démonterait ce composant et perdrait pendingSave
  } catch (err: any) {
    toast.error('Échec', err?.data?.message ?? String(err))
  } finally {
    saving.value = false
  }
}

async function restartNetwork() {
  restarting.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/network/restart`, { method: 'POST' })
    // Le restart a été lancé côté serveur. La DB a été mise à jour avec la nouvelle IP
    // et le pool SSH est en cours de reconnexion. On efface le pending maintenant :
    // si SSH revient = la config est appliquée, si elle ne revient pas = l'utilisateur
    // verra la bannière SSH down et pourra corriger.
    clearPending(props.sanId)
    toast.success('Redémarrage réseau lancé', 'La connexion SSH peut mettre quelques secondes à se rétablir.')
    emit('restarted')
  } catch (err: any) {
    toast.error('Échec du redémarrage', err?.data?.message ?? String(err))
  } finally {
    restarting.value = false
  }
}
</script>
