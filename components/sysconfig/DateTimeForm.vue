<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-clock" class="text-gray-500 size-5" />
        <span class="font-semibold text-gray-800">Date &amp; Heure</span>
      </div>
    </template>

    <div class="space-y-5">
      <!-- Current time (read-only) -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-500">Heure système :</span>
        <UBadge color="gray" variant="subtle" :label="config.currentTime || '—'" />
      </div>

      <!-- Timezone -->
      <UFormField label="Fuseau horaire">
        <USelectMenu
          v-model="form.timezone"
          :items="tzList"
          :loading="tzLoading"
          :placeholder="tzLoading ? 'Chargement…' : 'Sélectionner (ex: Europe/Paris)'"
          :disabled="isDisabled"
          :search-input="{ placeholder: 'Rechercher…' }"
          class="w-full"
        />
      </UFormField>

      <!-- NTP servers -->
      <UFormField label="Serveurs NTP">
        <div class="space-y-2">
          <div
            v-for="(server, idx) in form.ntpServers"
            :key="idx"
            class="flex items-center gap-2"
          >
            <UInput
              v-model="form.ntpServers[idx]"
              placeholder="pool.ntp.org"
              class="flex-1"
              :disabled="isDisabled"
            />
            <UButton
              icon="i-heroicons-trash"
              color="red"
              variant="ghost"
              size="sm"
              :disabled="isDisabled || form.ntpServers.length <= 1"
              @click="removeServer(idx)"
            />
          </div>
          <UButton
            label="Ajouter un serveur"
            icon="i-heroicons-plus"
            variant="outline"
            size="sm"
            :disabled="isDisabled"
            @click="addServer"
          />
        </div>
      </UFormField>

      <div v-if="config.ntpRunning !== undefined" class="flex items-center gap-2 text-sm">
        <span
          class="size-2 rounded-full"
          :class="config.ntpRunning ? 'bg-green-500' : 'bg-gray-400'"
        />
        <span class="text-gray-500">ntpd : {{ config.ntpRunning ? 'actif' : 'inactif' }}</span>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          label="Enregistrer"
          icon="i-heroicons-check"
          :loading="saving"
          :disabled="!dirty || props.disabled"
          @click="save"
        />
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import type { DateTimeConfig } from '~/server/utils/types'
import { useAppToast }         from '~/composables/useAppToast'

const props = defineProps<{
  sanId:    string
  config:   DateTimeConfig
  disabled?: boolean
}>()

const emit = defineEmits<{
  saved: []
}>()

const toast = useAppToast()

const form = reactive({
  timezone:   props.config.timezone,
  ntpServers: [...(props.config.ntpServers.length ? props.config.ntpServers : [''])],
})

// ── Timezone datalist ──────────────────────────────────────────────────────────
const tzList    = ref<string[]>([])
const tzLoading = ref(false)

onMounted(async () => {
  tzLoading.value = true
  try {
    const { timezones } = await $fetch<{ timezones: string[] }>(
      `/api/san/${props.sanId}/system-config/timezones`,
    )
    tzList.value = timezones
  } catch { /* SSH indisponible — saisie libre */ }
  finally { tzLoading.value = false }
})

const saving = ref(false)

const isDisabled = computed(() => props.disabled || saving.value)

const dirty = computed(() =>
  form.timezone !== props.config.timezone ||
  JSON.stringify(form.ntpServers) !== JSON.stringify(props.config.ntpServers)
)

function addServer()        { form.ntpServers.push('') }
function removeServer(i: number) { form.ntpServers.splice(i, 1) }

async function save() {
  saving.value = true
  try {
    await $fetch(`/api/san/${props.sanId}/system-config/datetime`, {
      method: 'PATCH',
      body: {
        timezone:   form.timezone,
        ntpServers: form.ntpServers.filter(Boolean),
      },
    })
    toast.success('Date & Heure mis à jour')
    emit('saved')
  } catch (err: any) {
    toast.error('Échec', err?.data?.message ?? String(err))
  } finally {
    saving.value = false
  }
}
</script>
